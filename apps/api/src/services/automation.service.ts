import {
  AutomationPlanStatus,
  Prisma,
  ReminderRecipientRole,
  ReminderStatus,
  ReminderType,
  prisma,
} from "@jw-reminders/database";
import {
  DEFAULT_SEND_HOUR,
  DEFAULT_TIMEZONE,
  calculateReminderScheduledAt,
  dateToLocalDateString,
} from "./date-utils.js";

type Tx = Prisma.TransactionClient;

type AssignmentWithRelations = Prisma.JwAssignmentGetPayload<{
  include: {
    meetingWeek: { include: { monthlySchedule: true } };
    assigned: true;
    companion: true;
  };
}>;

const ASSIGNED_RULES: ReminderType[] = [
  "INITIAL_NOTICE",
  "SEVEN_DAYS_BEFORE",
  "THREE_DAYS_BEFORE",
  "ONE_DAY_BEFORE",
  "SAME_DAY",
];

const COMPANION_RULES: ReminderType[] = [
  "INITIAL_NOTICE",
  "THREE_DAYS_BEFORE",
  "ONE_DAY_BEFORE",
  "SAME_DAY",
];

const NORMAL_REMINDERS: ReminderType[] = [
  "INITIAL_NOTICE",
  "SEVEN_DAYS_BEFORE",
  "THREE_DAYS_BEFORE",
  "ONE_DAY_BEFORE",
  "SAME_DAY",
];

const CANCELLABLE_STATUSES: ReminderStatus[] = ["PENDING", "QUEUED", "FAILED"];

const SPANISH_MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

export async function getAutomationConfig(tx: Tx = prisma) {
  const configs = await tx.appConfig.findMany({
    where: { key: { in: ["TIMEZONE", "REMINDER_SEND_HOUR"] } },
  });
  const map = Object.fromEntries(configs.map((config) => [config.key, config.value]));
  const sendHour = Number(map.REMINDER_SEND_HOUR || DEFAULT_SEND_HOUR);

  return {
    timezone: map.TIMEZONE || DEFAULT_TIMEZONE,
    sendHour: Number.isInteger(sendHour) && sendHour >= 0 && sendHour <= 23 ? sendHour : DEFAULT_SEND_HOUR,
  };
}

export function monthlyScheduleParts(dateLocal: string) {
  const [year, month] = dateLocal.split("-").map(Number);
  if (!year || !month) throw new Error(`Invalid local date for monthly schedule: ${dateLocal}`);
  return {
    year,
    month,
    name: `${SPANISH_MONTHS[month - 1]} ${year}`,
  };
}

export async function ensureMonthlyScheduleForDate(tx: Tx, dateLocal: string) {
  const { year, month, name } = monthlyScheduleParts(dateLocal);
  const schedule = await tx.monthlySchedule.upsert({
    where: { year_month: { year, month } },
    update: {},
    create: {
      year,
      month,
      name,
      status: "ACTIVE",
    },
  });

  await createAutomationEvent(tx, {
    eventType: "MONTHLY_PROGRAM_CREATED",
    entityType: "MonthlySchedule",
    entityId: schedule.id,
    actorType: "system",
    metadata: { year, month, ensured: true },
  });

  return schedule;
}

export async function createAutomationEvent(
  tx: Tx,
  data: {
    eventType: string;
    entityType: string;
    entityId: string;
    actorType?: string;
    actorId?: string;
    metadata?: Prisma.InputJsonValue;
  },
) {
  return tx.jwAutomationEvent.create({
    data: {
      eventType: data.eventType,
      entityType: data.entityType,
      entityId: data.entityId,
      actorType: data.actorType || "system",
      actorId: data.actorId,
      metadata: data.metadata || {},
    },
  });
}

export function publisherSnapshot(publisher?: { displayName: string | null; fullName: string; whatsappPhone: string | null; phone: string } | null) {
  if (!publisher) {
    return { name: null, phone: null };
  }
  return {
    name: publisher.displayName || publisher.fullName,
    phone: publisher.whatsappPhone || publisher.phone,
  };
}

export async function applyAssignmentSnapshots(tx: Tx, assignmentId: string) {
  const assignment = await tx.jwAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: { assigned: true, companion: true },
  });
  const assigned = publisherSnapshot(assignment.assigned);
  const companion = publisherSnapshot(assignment.companion);

  return tx.jwAssignment.update({
    where: { id: assignmentId },
    data: {
      assignedNameSnapshot: assigned.name,
      assignedPhoneSnapshot: assigned.phone,
      companionNameSnapshot: companion.name,
      companionPhoneSnapshot: companion.phone,
    },
  });
}

async function loadAssignment(tx: Tx, assignmentId: string): Promise<AssignmentWithRelations> {
  return tx.jwAssignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: {
      meetingWeek: { include: { monthlySchedule: true } },
      assigned: true,
      companion: true,
    },
  });
}

async function nextPlanVersion(tx: Tx, assignmentId: string) {
  const latest = await tx.automationPlan.findFirst({
    where: { assignmentId },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  return (latest?.version || 0) + 1;
}

function deliveryRules(options: { includeInitial: boolean; includeNormal: boolean; includeChangeNotice?: boolean; includeCancellationNotice?: boolean }) {
  const assigned = options.includeNormal ? [...ASSIGNED_RULES] : [];
  const companion = options.includeNormal ? [...COMPANION_RULES] : [];

  if (!options.includeInitial) {
    removeValue(assigned, "INITIAL_NOTICE");
    removeValue(companion, "INITIAL_NOTICE");
  }
  if (options.includeChangeNotice) {
    assigned.push("CHANGE_NOTICE");
    companion.push("CHANGE_NOTICE");
  }
  if (options.includeCancellationNotice) {
    assigned.push("CANCELLATION_NOTICE");
    companion.push("CANCELLATION_NOTICE");
  }

  return { assigned, companion };
}

function removeValue(values: ReminderType[], value: ReminderType) {
  const index = values.indexOf(value);
  if (index >= 0) values.splice(index, 1);
}

function buildDeliveryRows(
  assignment: AssignmentWithRelations,
  automationPlanId: string,
  rules: { assigned: ReminderType[]; companion: ReminderType[] },
  config: { timezone: string; sendHour: number },
  now: Date,
) {
  const meetingDateLocal = assignment.meetingWeek.meetingDateLocal || dateToLocalDateString(assignment.meetingWeek.meetingDate);
  const rows: Prisma.ReminderDeliveryCreateManyInput[] = [];

  for (const reminderType of rules.assigned) {
    rows.push({
      automationPlanId,
      assignmentId: assignment.id,
      publisherId: assignment.assignedPublisherId,
      recipientRole: "ASSIGNED",
      reminderType,
      scheduledAt: calculateReminderScheduledAt({
        meetingDateLocal,
        meetingTime: assignment.meetingWeek.meetingTime,
        reminderType,
        timezone: config.timezone,
        sendHour: config.sendHour,
        now,
      }),
    });
  }

  if (assignment.companionPublisherId) {
    for (const reminderType of rules.companion) {
      rows.push({
        automationPlanId,
        assignmentId: assignment.id,
        publisherId: assignment.companionPublisherId,
        recipientRole: "COMPANION",
        reminderType,
        scheduledAt: calculateReminderScheduledAt({
          meetingDateLocal,
          meetingTime: assignment.meetingWeek.meetingTime,
          reminderType,
          timezone: config.timezone,
          sendHour: config.sendHour,
          now,
        }),
      });
    }
  }

  return rows;
}

export async function createAutomationPlanForAssignment(
  tx: Tx,
  assignmentId: string,
  options: {
    includeInitial?: boolean;
    includeNormal?: boolean;
    includeChangeNotice?: boolean;
    includeCancellationNotice?: boolean;
    actorType?: string;
    reason?: string;
  } = {},
) {
  const assignment = await loadAssignment(tx, assignmentId);
  const config = await getAutomationConfig(tx);
  const now = new Date();
  const version = await nextPlanVersion(tx, assignmentId);
  const rules = deliveryRules({
    includeInitial: options.includeInitial ?? true,
    includeNormal: options.includeNormal ?? true,
    includeChangeNotice: options.includeChangeNotice,
    includeCancellationNotice: options.includeCancellationNotice,
  });
  const meetingDateLocal = assignment.meetingWeek.meetingDateLocal || dateToLocalDateString(assignment.meetingWeek.meetingDate);

  const plan = await tx.automationPlan.create({
    data: {
      assignmentId,
      status: "DRAFT",
      version,
      timezone: config.timezone,
      sendHour: config.sendHour,
      meetingDateLocal,
      meetingTimeLocal: assignment.meetingWeek.meetingTime,
      rules,
    },
  });

  const deliveries = buildDeliveryRows(assignment, plan.id, rules, config, now);
  if (deliveries.length > 0) {
    await tx.reminderDelivery.createMany({ data: deliveries, skipDuplicates: true });
  }

  const activePlan = await tx.automationPlan.update({
    where: { id: plan.id },
    data: { status: options.includeCancellationNotice ? "CANCELLED" : "ACTIVE" },
  });

  if (!options.includeCancellationNotice) {
    await tx.jwAssignment.update({
      where: { id: assignmentId },
      data: { status: "SCHEDULED", version: { increment: 1 } },
    });
  }

  await createAutomationEvent(tx, {
    eventType: "AUTOMATION_PLAN_CREATED",
    entityType: "AutomationPlan",
    entityId: plan.id,
    actorType: options.actorType || "system",
    metadata: { assignmentId, version, reason: options.reason || "generated" },
  });
  await createAutomationEvent(tx, {
    eventType: options.includeChangeNotice || options.includeCancellationNotice ? "REMINDERS_REGENERATED" : "REMINDERS_GENERATED",
    entityType: "AutomationPlan",
    entityId: plan.id,
    actorType: options.actorType || "system",
    metadata: { assignmentId, count: deliveries.length, rules },
  });

  return { plan: activePlan, created: deliveries.length };
}

export async function cancelPendingDeliveriesForAssignment(tx: Tx, assignmentId: string, reason: string, reminderTypes?: ReminderType[]) {
  const result = await tx.reminderDelivery.updateMany({
    where: {
      assignmentId,
      status: { in: CANCELLABLE_STATUSES },
      ...(reminderTypes ? { reminderType: { in: reminderTypes } } : {}),
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason: reason,
    },
  });

  if (result.count > 0) {
    await createAutomationEvent(tx, {
      eventType: "REMINDER_CANCELLED",
      entityType: "JwAssignment",
      entityId: assignmentId,
      metadata: { reason, count: result.count },
    });
  }

  return result.count;
}

export async function supersedeActivePlansForAssignment(tx: Tx, assignmentId: string, reason: string) {
  const activePlans = await tx.automationPlan.findMany({
    where: { assignmentId, status: "ACTIVE" },
  });

  for (const plan of activePlans) {
    await tx.automationPlan.update({
      where: { id: plan.id },
      data: { status: "SUPERSEDED", supersededAt: new Date() },
    });
    await createAutomationEvent(tx, {
      eventType: "AUTOMATION_PLAN_SUPERSEDED",
      entityType: "AutomationPlan",
      entityId: plan.id,
      metadata: { assignmentId, reason },
    });
  }

  await cancelPendingDeliveriesForAssignment(tx, assignmentId, reason, NORMAL_REMINDERS);
  return activePlans.length;
}

export async function regenerateAssignmentAutomation(tx: Tx, assignmentId: string, reason: string) {
  const superseded = await supersedeActivePlansForAssignment(tx, assignmentId, reason);
  if (superseded === 0) return { created: 0, superseded: 0 };

  const { created } = await createAutomationPlanForAssignment(tx, assignmentId, {
    includeInitial: false,
    includeNormal: true,
    includeChangeNotice: true,
    reason,
  });

  return { created, superseded };
}

export async function cancelAssignmentAutomation(tx: Tx, assignmentId: string, reason: string) {
  const activePlans = await tx.automationPlan.findMany({
    where: { assignmentId, status: "ACTIVE" },
  });
  const hadAutomation = activePlans.length > 0;

  await cancelPendingDeliveriesForAssignment(tx, assignmentId, reason, NORMAL_REMINDERS);

  for (const plan of activePlans) {
    await tx.automationPlan.update({
      where: { id: plan.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await createAutomationEvent(tx, {
      eventType: "AUTOMATION_PLAN_CANCELLED",
      entityType: "AutomationPlan",
      entityId: plan.id,
      metadata: { assignmentId, reason },
    });
  }

  if (hadAutomation) {
    const latestPlan = activePlans[0];
    const assignment = await loadAssignment(tx, assignmentId);
    const config = await getAutomationConfig(tx);
    const rows = buildDeliveryRows(
      assignment,
      latestPlan.id,
      { assigned: ["CANCELLATION_NOTICE"], companion: assignment.companionPublisherId ? ["CANCELLATION_NOTICE"] : [] },
      config,
      new Date(),
    );
    if (rows.length > 0) {
      await tx.reminderDelivery.createMany({ data: rows, skipDuplicates: true });
      await createAutomationEvent(tx, {
        eventType: "CANCELLATION_NOTICE_CREATED",
        entityType: "JwAssignment",
        entityId: assignmentId,
        metadata: { count: rows.length, reason },
      });
    }
  }

  return { hadAutomation };
}

export async function archiveAssignmentAutomation(tx: Tx, assignmentId: string, reason: string) {
  await cancelPendingDeliveriesForAssignment(tx, assignmentId, reason, NORMAL_REMINDERS);
  await tx.automationPlan.updateMany({
    where: { assignmentId, status: "ACTIVE" },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
}

export async function hasAssignmentAutomation(tx: Tx, assignmentId: string) {
  const count = await tx.automationPlan.count({ where: { assignmentId } });
  return count > 0;
}

