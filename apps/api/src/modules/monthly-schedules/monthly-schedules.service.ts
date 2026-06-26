import { prisma, ReminderStatus } from "@jw-reminders/database";
import {
  applyAssignmentSnapshots,
  createAutomationEvent,
  createAutomationPlanForAssignment,
  regenerateAssignmentAutomation,
} from "../../services/automation.service.js";

// ─── Delivery status buckets ─────────────────────────────
const PENDING_STATUSES: ReminderStatus[] = ["PENDING", "QUEUED", "SENDING"];
const SENT_STATUSES: ReminderStatus[] = ["SENT"];
const FAILED_STATUSES: ReminderStatus[] = ["FAILED", "DEAD"];
const CANCELLABLE_STATUSES: ReminderStatus[] = ["PENDING", "QUEUED", "FAILED"];

// Weeks that no longer participate in the active program lifecycle.
const INACTIVE_WEEK_STATUSES = ["ARCHIVED", "CANCELLED"] as const;

interface DeliveryCounts {
  total: number;
  pending: number;
  sent: number;
  failed: number;
  cancelled: number;
  skipped: number;
}

function emptyCounts(): DeliveryCounts {
  return { total: 0, pending: 0, sent: 0, failed: 0, cancelled: 0, skipped: 0 };
}

function bucketDelivery(counts: DeliveryCounts, status: ReminderStatus) {
  counts.total += 1;
  if (PENDING_STATUSES.includes(status)) counts.pending += 1;
  else if (SENT_STATUSES.includes(status)) counts.sent += 1;
  else if (FAILED_STATUSES.includes(status)) counts.failed += 1;
  else if (status === "CANCELLED") counts.cancelled += 1;
  else if (status === "SKIPPED") counts.skipped += 1;
}

/**
 * Completion of a single week, mirrored from the web "semanas" view:
 *  1. week exists, 2. has assignments, 3. has automations, 4. nothing pending.
 */
function weekCompletion(assignmentCount: number, counts: DeliveryCounts): number {
  const steps = [
    true,
    assignmentCount > 0,
    counts.total > 0,
    counts.total > 0 && counts.pending === 0,
  ];
  return Math.round((steps.filter(Boolean).length / steps.length) * 100);
}

// ─── List with metrics ───────────────────────────────────
export async function listMonthlySchedules() {
  const schedules = await prisma.monthlySchedule.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: {
      weeks: {
        include: {
          _count: { select: { assignments: true } },
          assignments: { select: { reminderDeliveries: { select: { status: true } } } },
        },
      },
    },
  });

  return schedules.map((schedule) => {
    let assignmentCount = 0;
    const totals = emptyCounts();
    const weekPcts: number[] = [];

    for (const week of schedule.weeks) {
      assignmentCount += week._count.assignments;
      const weekCounts = emptyCounts();
      for (const assignment of week.assignments) {
        for (const delivery of assignment.reminderDeliveries) {
          bucketDelivery(weekCounts, delivery.status);
          bucketDelivery(totals, delivery.status);
        }
      }
      if (!INACTIVE_WEEK_STATUSES.includes(week.status as any)) {
        weekPcts.push(weekCompletion(week._count.assignments, weekCounts));
      }
    }

    const completion = weekPcts.length
      ? Math.round(weekPcts.reduce((sum, value) => sum + value, 0) / weekPcts.length)
      : 0;

    const { weeks, ...data } = schedule;
    return {
      ...data,
      weekCount: weeks.length,
      assignmentCount,
      deliveryCount: totals.total,
      pending: totals.pending,
      sent: totals.sent,
      failed: totals.failed,
      cancelled: totals.cancelled,
      completion,
    };
  });
}

// ─── Detail with rich per-week + program metrics ─────────
export async function getMonthlyScheduleDetail(id: string) {
  const schedule = await prisma.monthlySchedule.findUniqueOrThrow({
    where: { id },
    include: {
      weeks: {
        orderBy: { weekStartDate: "asc" },
        include: {
          _count: { select: { assignments: true } },
          assignments: {
            select: {
              id: true,
              status: true,
              reminderDeliveries: { select: { status: true } },
              automationPlans: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  const totals = emptyCounts();
  let totalAssignments = 0;
  let automationPlanCount = 0;
  let activeWeeks = 0;
  const weekPcts: number[] = [];

  const weeks = schedule.weeks.map((week) => {
    const weekCounts = emptyCounts();
    let weekPlans = 0;
    for (const assignment of week.assignments) {
      weekPlans += assignment.automationPlans.length;
      for (const delivery of assignment.reminderDeliveries) {
        bucketDelivery(weekCounts, delivery.status);
        bucketDelivery(totals, delivery.status);
      }
    }
    totalAssignments += week._count.assignments;
    automationPlanCount += weekPlans;

    const isActive = !INACTIVE_WEEK_STATUSES.includes(week.status as any);
    if (isActive) activeWeeks += 1;
    const completion = weekCompletion(week._count.assignments, weekCounts);
    if (isActive) weekPcts.push(completion);

    return {
      id: week.id,
      weekStartDate: week.weekStartDate,
      weekStartDateLocal: week.weekStartDateLocal,
      meetingDate: week.meetingDate,
      meetingDateLocal: week.meetingDateLocal,
      meetingTime: week.meetingTime,
      congregationName: week.congregationName,
      status: week.status,
      assignmentCount: week._count.assignments,
      automationPlanCount: weekPlans,
      total: weekCounts.total,
      pending: weekCounts.pending,
      sent: weekCounts.sent,
      failed: weekCounts.failed,
      cancelled: weekCounts.cancelled,
      skipped: weekCounts.skipped,
      completion,
    };
  });

  const completion = weekPcts.length
    ? Math.round(weekPcts.reduce((sum, value) => sum + value, 0) / weekPcts.length)
    : 0;

  const { weeks: _weeks, ...data } = schedule;
  return {
    ...data,
    metrics: {
      totalWeeks: weeks.length,
      activeWeeks,
      totalAssignments,
      totalAutomations: totals.total,
      automationPlanCount,
      pending: totals.pending,
      sent: totals.sent,
      failed: totals.failed,
      cancelled: totals.cancelled,
      skipped: totals.skipped,
      completion,
    },
    weeks,
  };
}

// ─── Bulk: generate automations for all active weeks ─────
export async function generateProgramAutomations(id: string) {
  return prisma.$transaction(
    async (tx) => {
      const schedule = await tx.monthlySchedule.findUniqueOrThrow({
        where: { id },
        include: {
          weeks: {
            where: { status: { notIn: [...INACTIVE_WEEK_STATUSES] } },
            include: { assignments: { select: { id: true, status: true } } },
          },
        },
      });

      let created = 0;
      let plans = 0;
      let skipped = 0;

      for (const week of schedule.weeks) {
        let weekCreated = 0;
        for (const assignment of week.assignments) {
          if (assignment.status === "CANCELLED" || assignment.status === "COMPLETED") continue;
          const active = await tx.automationPlan.findFirst({
            where: { assignmentId: assignment.id, status: "ACTIVE" },
            select: { id: true },
          });
          if (active) {
            skipped += 1;
            continue;
          }
          await applyAssignmentSnapshots(tx, assignment.id);
          const result = await createAutomationPlanForAssignment(tx, assignment.id, {
            includeInitial: true,
            includeNormal: true,
            reason: "program_bulk_generate",
            actorType: "admin",
          });
          created += result.created;
          plans += 1;
          weekCreated += result.created;
        }
        if (weekCreated > 0) {
          await tx.jwMeetingWeek.update({ where: { id: week.id }, data: { status: "ACTIVE" } });
        }
      }

      await createAutomationEvent(tx, {
        eventType: "MONTHLY_AUTOMATIONS_GENERATED",
        entityType: "MonthlySchedule",
        entityId: id,
        actorType: "admin",
        metadata: { created, plans, skipped },
      });

      return { created, plans, skipped };
    },
    { timeout: 30000 },
  );
}

// ─── Bulk: regenerate plans that already exist ───────────
export async function regenerateProgramPending(id: string) {
  return prisma.$transaction(
    async (tx) => {
      const schedule = await tx.monthlySchedule.findUniqueOrThrow({
        where: { id },
        include: {
          weeks: {
            where: { status: { notIn: [...INACTIVE_WEEK_STATUSES] } },
            include: { assignments: { select: { id: true, status: true } } },
          },
        },
      });

      let created = 0;
      let superseded = 0;

      for (const week of schedule.weeks) {
        for (const assignment of week.assignments) {
          if (assignment.status === "CANCELLED" || assignment.status === "COMPLETED") continue;
          const result = await regenerateAssignmentAutomation(tx, assignment.id, "program_regenerate");
          created += result.created;
          superseded += result.superseded;
        }
      }

      await createAutomationEvent(tx, {
        eventType: "MONTHLY_AUTOMATIONS_REGENERATED",
        entityType: "MonthlySchedule",
        entityId: id,
        actorType: "admin",
        metadata: { created, superseded },
      });

      return { created, superseded };
    },
    { timeout: 30000 },
  );
}

// ─── Bulk: cancel pending deliveries across the program ──
export async function cancelProgramPending(id: string) {
  return prisma.$transaction(async (tx) => {
    await tx.monthlySchedule.findUniqueOrThrow({ where: { id }, select: { id: true } });
    const assignments = await tx.jwAssignment.findMany({
      where: { meetingWeek: { monthlyScheduleId: id } },
      select: { id: true },
    });
    const assignmentIds = assignments.map((assignment) => assignment.id);
    if (assignmentIds.length === 0) return { cancelled: 0 };

    const result = await tx.reminderDelivery.updateMany({
      where: { assignmentId: { in: assignmentIds }, status: { in: CANCELLABLE_STATUSES } },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "program_cancel_pending" },
    });

    if (result.count > 0) {
      await createAutomationEvent(tx, {
        eventType: "MONTHLY_AUTOMATIONS_CANCELLED",
        entityType: "MonthlySchedule",
        entityId: id,
        actorType: "admin",
        metadata: { cancelled: result.count },
      });
    }

    return { cancelled: result.count };
  });
}
