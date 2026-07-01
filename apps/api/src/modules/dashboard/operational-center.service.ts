import { prisma, ReminderStatus } from "@jw-reminders/database";
import {
  addDaysToLocalDate,
  localDateLabel,
  localTimeLabel,
  localToday,
  zonedLocalTimeToUtc,
} from "../../services/date-utils.js";
import { getAutomationConfig } from "../../services/automation.service.js";

const WA_URL = process.env.WHATSAPP_API_URL || "http://jw-reminders-whatsapp:3010";
const PENDING_DELIVERY_STATUSES: ReminderStatus[] = ["PENDING", "QUEUED", "SENDING"];
const FAILED_DELIVERY_STATUSES: ReminderStatus[] = ["FAILED", "DEAD"];
const OPEN_WEEK_STATUSES = ["DRAFT", "READY", "ACTIVE"] as const;
const OPEN_PROGRAM_STATUSES = ["DRAFT", "ACTIVE"] as const;

function rangeBounds(startLocal: string, days: number, timeZone: string) {
  return {
    startUtc: zonedLocalTimeToUtc(startLocal, 0, 0, timeZone),
    endUtc: zonedLocalTimeToUtc(addDaysToLocalDate(startLocal, days), 0, 0, timeZone),
  };
}

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function nextMonthStart(value: string) {
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return `${next.year}-${String(next.month).padStart(2, "0")}-01`;
}

function daysInMonth(startLocal: string) {
  const year = Number(startLocal.slice(0, 4));
  const month = Number(startLocal.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function displayName(publisher?: { displayName: string | null; fullName: string } | null) {
  return publisher?.displayName || publisher?.fullName || "Sin publicador";
}

function deliveryItem(delivery: any, timeZone: string) {
  return {
    id: delivery.id,
    status: delivery.status,
    reminderType: delivery.reminderType,
    recipientRole: delivery.recipientRole,
    scheduledAt: delivery.scheduledAt,
    localDate: localDateLabel(delivery.scheduledAt, timeZone),
    localTime: localTimeLabel(delivery.scheduledAt, timeZone),
    publisherName: displayName(delivery.publisher),
    assignmentTitle: delivery.assignment?.title || "Sin asignacion",
    assignmentId: delivery.assignmentId,
    meetingWeekId: delivery.assignment?.meetingWeek?.id || null,
    programId: delivery.assignment?.meetingWeek?.monthlySchedule?.id || null,
    programName: delivery.assignment?.meetingWeek?.monthlySchedule?.name || null,
    errorMessage: delivery.messageLogs?.[0]?.errorMessage || delivery.errorMessage || null,
  };
}

function summarizeDeliveries(deliveries: any[], timeZone: string) {
  const summary = {
    total: deliveries.length,
    pending: 0,
    queued: 0,
    sending: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    cancelled: 0,
    dead: 0,
    assigned: 0,
    companions: 0,
    items: deliveries.slice(0, 10).map((delivery) => deliveryItem(delivery, timeZone)),
  };

  for (const delivery of deliveries) {
    const key = String(delivery.status).toLowerCase() as keyof typeof summary;
    if (typeof summary[key] === "number") (summary[key] as number) += 1;
    if (delivery.recipientRole === "ASSIGNED") summary.assigned += 1;
    if (delivery.recipientRole === "COMPANION") summary.companions += 1;
  }

  return summary;
}

function countWeekDeliveries(assignments: any[]) {
  const counts = { total: 0, pending: 0, sent: 0, failed: 0, cancelled: 0, skipped: 0 };
  for (const assignment of assignments) {
    for (const delivery of assignment.reminderDeliveries || []) {
      counts.total += 1;
      if (PENDING_DELIVERY_STATUSES.includes(delivery.status)) counts.pending += 1;
      else if (delivery.status === "SENT") counts.sent += 1;
      else if (FAILED_DELIVERY_STATUSES.includes(delivery.status)) counts.failed += 1;
      else if (delivery.status === "CANCELLED") counts.cancelled += 1;
      else if (delivery.status === "SKIPPED") counts.skipped += 1;
    }
  }
  return counts;
}

function completionForWeek(assignmentCount: number, templateCount: number, deliveryCount: number, pendingCount: number) {
  const steps = [
    true,
    templateCount > 0,
    assignmentCount > 0,
    deliveryCount > 0 && pendingCount === 0,
  ];
  return Math.round((steps.filter(Boolean).length / steps.length) * 100);
}

function programSummary(program: any) {
  let assignmentCount = 0;
  let proposedCount = 0;
  let templateCount = 0;
  let deliveryCount = 0;
  let pending = 0;
  let failed = 0;
  const weekCompletions: number[] = [];

  for (const week of program.weeks || []) {
    const counts = countWeekDeliveries(week.assignments || []);
    const assignments = week.assignments || [];
    assignmentCount += assignments.length;
    proposedCount += assignments.filter((assignment: any) => assignment.status === "PROPOSED").length;
    templateCount += week.assignmentTemplates?.length || 0;
    deliveryCount += counts.total;
    pending += counts.pending;
    failed += counts.failed;
    if (week.status !== "ARCHIVED" && week.status !== "CANCELLED") {
      weekCompletions.push(completionForWeek(assignments.length, week.assignmentTemplates?.length || 0, counts.total, counts.pending));
    }
  }

  const completion = weekCompletions.length
    ? Math.round(weekCompletions.reduce((sum, value) => sum + value, 0) / weekCompletions.length)
    : 0;

  return {
    id: program.id,
    name: program.name,
    year: program.year,
    month: program.month,
    status: program.status,
    weekCount: program.weeks?.length || 0,
    assignmentCount,
    proposedCount,
    templateCount,
    deliveryCount,
    pending,
    failed,
    completion,
  };
}

function weekSummary(week: any) {
  const counts = countWeekDeliveries(week.assignments || []);
  const assignmentCount = week.assignments?.length || 0;
  const templateCount = week.assignmentTemplates?.length || 0;
  return {
    id: week.id,
    status: week.status,
    meetingDate: week.meetingDate,
    meetingDateLocal: week.meetingDateLocal,
    meetingTime: week.meetingTime,
    programId: week.monthlySchedule?.id || null,
    programName: week.monthlySchedule?.name || null,
    assignmentCount,
    templateCount,
    deliveryCount: counts.total,
    pending: counts.pending,
    failed: counts.failed,
    completion: completionForWeek(assignmentCount, templateCount, counts.total, counts.pending),
  };
}

async function getWhatsappStatus() {
  try {
    const response = await fetch(`${WA_URL}/status`);
    if (!response.ok) throw new Error("WhatsApp status unavailable");
    const data = await response.json();
    const status = String(data.status || "DISCONNECTED").toUpperCase();
    return {
      status,
      label: status === "READY" ? "Listo" : status === "QR_REQUIRED" ? "Esperando QR" : "Desconectado",
      ready: status === "READY",
      connectedNumber: data.connectedNumber || null,
      deviceName: data.deviceName || null,
      lastConnected: data.lastConnected || null,
      lastDisconnected: data.lastDisconnected || null,
      error: data.error || null,
    };
  } catch {
    return {
      status: "DISCONNECTED",
      label: "Desconectado",
      ready: false,
      connectedNumber: null,
      deviceName: null,
      lastConnected: null,
      lastDisconnected: null,
      error: null,
    };
  }
}

function buildFlow(currentProgram: any | null, importedProgramCount: number) {
  const program = currentProgram ? programSummary(currentProgram) : null;
  const hasWeeks = Boolean(program && program.weekCount > 0);
  const hasImported = Boolean(program && program.templateCount > 0) || importedProgramCount > 0;
  const hasTemplates = Boolean(program && program.templateCount > 0);
  const hasProposal = Boolean(program && program.proposedCount > 0);
  const hasAssignments = Boolean(program && program.assignmentCount > program.proposedCount);
  const hasAutomations = Boolean(program && program.deliveryCount > 0);
  const isReady = Boolean(program && hasWeeks && hasTemplates && hasAssignments && hasAutomations && program.pending >= 0 && program.failed === 0);

  const steps = [
    { key: "program", label: "Programa creado", done: Boolean(program) },
    { key: "weeks", label: "Semanas generadas", done: hasWeeks },
    { key: "import", label: "Programa importado", done: hasImported },
    { key: "templates", label: "Templates creados", done: hasTemplates },
    { key: "proposal", label: "Propuesta pendiente", done: hasProposal || hasAssignments },
    { key: "approval", label: "Aprobacion pendiente", done: !hasProposal && hasAssignments },
    { key: "automations", label: "Generar automatizaciones", done: hasAutomations },
    { key: "ready", label: "Sistema listo", done: isReady },
  ];

  const current = steps.find((step) => !step.done) || steps[steps.length - 1];
  const actionByKey: Record<string, { label: string; href: string }> = {
    program: { label: "Crear programa", href: "/dashboard/programas" },
    weeks: { label: "Generar semanas", href: program ? `/dashboard/programas/${program.id}` : "/dashboard/programas" },
    import: { label: "Importar programa", href: "/dashboard/importar" },
    templates: { label: "Importar programa", href: "/dashboard/importar" },
    proposal: { label: "Generar propuesta", href: program ? `/dashboard/programas/${program.id}/propuesta` : "/dashboard/programas" },
    approval: { label: "Revisar propuesta", href: program ? `/dashboard/programas/${program.id}/propuesta` : "/dashboard/programas" },
    automations: { label: "Generar automatizaciones", href: program ? `/dashboard/programas/${program.id}` : "/dashboard/programas" },
    ready: { label: "Ver automatizaciones", href: "/dashboard/automatizaciones" },
  };

  return {
    steps,
    currentStep: current,
    nextAction: actionByKey[current.key],
  };
}

function makeAlert(alerts: any[], severity: "critical" | "warning" | "info", title: string, detail: string, actionLabel: string, href: string) {
  alerts.push({ id: `${severity}-${alerts.length + 1}`, severity, title, detail, actionLabel, href });
}

function buildCalendar(args: {
  monthStartLocal: string;
  todayLocal: string;
  timeZone: string;
  weeks: any[];
  deliveries: any[];
  programs: any[];
}) {
  const totalDays = daysInMonth(args.monthStartLocal);
  const days = Array.from({ length: totalDays }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    const date = `${args.monthStartLocal.slice(0, 8)}${day}`;
    return {
      date,
      day: index + 1,
      isToday: date === args.todayLocal,
      meetings: [] as any[],
      deliveries: [] as any[],
      programs: [] as any[],
    };
  });
  const byDate = new Map(days.map((day) => [day.date, day]));

  for (const program of args.programs) {
    const programDate = `${program.year}-${String(program.month).padStart(2, "0")}-01`;
    const day = byDate.get(programDate);
    if (day) day.programs.push({ id: program.id, name: program.name, status: program.status });
  }

  for (const week of args.weeks) {
    const date = week.meetingDateLocal || localDateLabel(week.meetingDate, args.timeZone);
    const day = byDate.get(date);
    if (day) {
      day.meetings.push({
        id: week.id,
        time: week.meetingTime,
        status: week.status,
        programName: week.monthlySchedule?.name || null,
      });
    }
  }

  for (const delivery of args.deliveries) {
    const date = localDateLabel(delivery.scheduledAt, args.timeZone);
    const day = byDate.get(date);
    if (day) {
      day.deliveries.push(deliveryItem(delivery, args.timeZone));
    }
  }

  return {
    month: args.monthStartLocal.slice(0, 7),
    selectedDate: byDate.has(args.todayLocal) ? args.todayLocal : args.monthStartLocal,
    days: days.map((day) => ({
      ...day,
      meetingCount: day.meetings.length,
      deliveryCount: day.deliveries.length,
      programCount: day.programs.length,
    })),
  };
}

export async function getOperationalCenter() {
  const config = await getAutomationConfig(prisma);
  const todayLocal = localToday(config.timezone);
  const tomorrowLocal = addDaysToLocalDate(todayLocal, 1);
  const todayRange = rangeBounds(todayLocal, 1, config.timezone);
  // Current ISO week (Monday..Sunday) that contains today, for the "Esta semana" section.
  const todayWeekday = new Date(`${todayLocal}T00:00:00.000Z`).getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = (todayWeekday + 6) % 7;
  const weekStartLocal = addDaysToLocalDate(todayLocal, -mondayOffset);
  const currentWeekRange = rangeBounds(weekStartLocal, 7, config.timezone);
  const tomorrowRange = rangeBounds(tomorrowLocal, 1, config.timezone);
  const nextSevenRange = rangeBounds(todayLocal, 7, config.timezone);
  const monthStartLocal = monthStart(todayLocal);
  const monthEndLocal = nextMonthStart(todayLocal);
  const monthRange = {
    startUtc: zonedLocalTimeToUtc(monthStartLocal, 0, 0, config.timezone),
    endUtc: zonedLocalTimeToUtc(monthEndLocal, 0, 0, config.timezone),
  };
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const deliveryInclude = {
    publisher: true,
    assignment: {
      include: {
        meetingWeek: { include: { monthlySchedule: true } },
      },
    },
    messageLogs: { orderBy: { createdAt: "desc" as const }, take: 1 },
  };

  const [
    whatsapp,
    appConfigs,
    programsRaw,
    weeksRaw,
    todayDeliveries,
    tomorrowDeliveries,
    nextSevenDeliveries,
    overdueDeliveries,
    failedDeliveries,
    cancelledDeliveries,
    monthDeliveries,
    publishers,
    lastMessage,
    lastWorkerEvent,
    importedEventCount,
    proposalApprovedCount,
    proposalDiscardedCount,
    thisWeekRaw,
  ] = await Promise.all([
    getWhatsappStatus(),
    prisma.appConfig.findMany({ where: { key: { in: ["TEST_MODE", "TEST_PHONE"] } } }),
    prisma.monthlySchedule.findMany({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 18,
      include: {
        weeks: {
          include: {
            assignmentTemplates: true,
            assignments: {
              select: {
                id: true,
                status: true,
                reminderDeliveries: { select: { status: true } },
              },
            },
          },
        },
      },
    }),
    prisma.jwMeetingWeek.findMany({
      where: { meetingDate: { gte: monthRange.startUtc, lt: monthRange.endUtc } },
      orderBy: { meetingDate: "asc" },
      include: {
        monthlySchedule: true,
        assignmentTemplates: true,
        assignments: {
          select: {
            id: true,
            status: true,
            reminderDeliveries: { select: { status: true } },
          },
        },
      },
    }),
    prisma.reminderDelivery.findMany({
      where: { scheduledAt: { gte: todayRange.startUtc, lt: todayRange.endUtc } },
      include: deliveryInclude,
      orderBy: { scheduledAt: "asc" },
      take: 40,
    }),
    prisma.reminderDelivery.findMany({
      where: { scheduledAt: { gte: tomorrowRange.startUtc, lt: tomorrowRange.endUtc } },
      include: deliveryInclude,
      orderBy: { scheduledAt: "asc" },
      take: 40,
    }),
    prisma.reminderDelivery.findMany({
      where: { scheduledAt: { gte: nextSevenRange.startUtc, lt: nextSevenRange.endUtc } },
      include: deliveryInclude,
      orderBy: { scheduledAt: "asc" },
      take: 120,
    }),
    prisma.reminderDelivery.findMany({
      where: { status: { in: ["PENDING", "FAILED"] }, scheduledAt: { lt: now } },
      include: deliveryInclude,
      orderBy: { scheduledAt: "asc" },
      take: 30,
    }),
    prisma.reminderDelivery.findMany({
      where: { status: { in: FAILED_DELIVERY_STATUSES } },
      include: deliveryInclude,
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma.reminderDelivery.findMany({
      where: { status: "CANCELLED", updatedAt: { gte: monthRange.startUtc } },
      include: deliveryInclude,
      orderBy: { updatedAt: "desc" },
      take: 30,
    }),
    prisma.reminderDelivery.findMany({
      where: { scheduledAt: { gte: monthRange.startUtc, lt: monthRange.endUtc } },
      include: deliveryInclude,
      orderBy: { scheduledAt: "asc" },
      take: 500,
    }),
    prisma.jwPublisher.findMany({ orderBy: { fullName: "asc" } }),
    prisma.jwMessageLog.findFirst({ orderBy: { createdAt: "desc" }, include: { publisher: true } }),
    prisma.jwAutomationEvent.findFirst({ where: { actorType: "worker" }, orderBy: { createdAt: "desc" } }),
    prisma.jwAutomationEvent.count({ where: { eventType: "PROGRAM_IMPORTED" } }),
    prisma.jwAutomationEvent.count({ where: { eventType: "MONTHLY_PROPOSAL_APPROVED" } }),
    prisma.jwAutomationEvent.count({ where: { eventType: "MONTHLY_PROPOSAL_DISCARDED" } }),
    prisma.jwMeetingWeek.findMany({
      where: {
        meetingDate: { gte: currentWeekRange.startUtc, lt: currentWeekRange.endUtc },
        status: { notIn: ["CANCELLED", "ARCHIVED"] },
      },
      orderBy: { meetingDate: "asc" },
      include: {
        monthlySchedule: true,
        assignmentTemplates: true,
        assignments: {
          select: {
            id: true,
            status: true,
            reminderDeliveries: { select: { status: true } },
          },
        },
      },
    }),
  ]);

  const configMap = Object.fromEntries(appConfigs.map((item) => [item.key, item.value]));
  const testMode = String(configMap.TEST_MODE ?? process.env.TEST_MODE ?? "false").toLowerCase() === "true";
  const currentProgram = programsRaw.find((program) => program.year === Number(todayLocal.slice(0, 4)) && program.month === Number(todayLocal.slice(5, 7)))
    || programsRaw.find((program) => OPEN_PROGRAM_STATUSES.includes(program.status as any))
    || null;
  const programs = programsRaw.map(programSummary);
  const weeks = weeksRaw.map(weekSummary);
  const thisWeek = thisWeekRaw.map(weekSummary);
  const activePrograms = programs.filter((program) => program.status === "ACTIVE");
  const pendingPrograms = programs.filter((program) => program.status === "DRAFT");
  const archivedPrograms = programs.filter((program) => program.status === "ARCHIVED");
  const incompletePrograms = programs.filter((program) => !["ARCHIVED", "CANCELLED"].includes(program.status) && program.completion < 100);
  const activeWeeks = weeks.filter((week) => week.status === "ACTIVE");
  const pendingWeeks = weeks.filter((week) => week.status === "DRAFT" || week.status === "READY");
  const incompleteWeeks = weeks.filter((week) => !["ARCHIVED", "CANCELLED"].includes(week.status) && week.completion < 100);
  const readyWeeks = weeks.filter((week) => week.status === "READY" || week.completion >= 100);
  const pendingProposalPrograms = programs.filter((program) => program.proposedCount > 0);
  const activePublishers = publishers.filter((publisher) => publisher.isActive && !publisher.deletedAt);
  const inactivePublishers = publishers.filter((publisher) => !publisher.isActive || Boolean(publisher.deletedAt));
  const newPublishers = publishers.filter((publisher) => publisher.createdAt >= thirtyDaysAgo);
  const noPhonePublishers = publishers.filter((publisher) => !publisher.phone?.trim() && !publisher.whatsappPhone?.trim());
  const noAssignmentPermission = publishers.filter((publisher) => !publisher.canReceiveAssignments && !publisher.deletedAt);
  const noCompanionPermission = publishers.filter((publisher) => !publisher.canBeCompanion && !publisher.deletedAt);
  const alerts: any[] = [];
  const workerEventAgeMinutes = lastWorkerEvent ? Math.round((now.getTime() - lastWorkerEvent.createdAt.getTime()) / 60000) : null;
  const workerAttention = overdueDeliveries.length > 0 && (!lastWorkerEvent || (workerEventAgeMinutes !== null && workerEventAgeMinutes > 30));

  if (!whatsapp.ready) makeAlert(alerts, "critical", "WhatsApp desconectado", "Los mensajes no saldran hasta reconectar WhatsApp.", "Ir a WhatsApp", "/dashboard/whatsapp");
  if (activePublishers.length === 0) makeAlert(alerts, "critical", "No hay publicadores registrados", "Registra publicadores para poder crear asignaciones y enviar recordatorios.", "Ir a publicadores", "/dashboard/publicadores");
  if (workerAttention) makeAlert(alerts, "critical", "Worker sin actividad reciente", "Hay entregas vencidas y no hay senales recientes del worker.", "Ver automatizaciones", "/dashboard/automatizaciones?status=failed&range=week");
  if (failedDeliveries.length > 0) makeAlert(alerts, "critical", "Automatizaciones fallidas", `${failedDeliveries.length} entregas requieren revision.`, "Revisar fallos", "/dashboard/automatizaciones?status=failed&range=month");
  if (overdueDeliveries.length > 0) makeAlert(alerts, "warning", "Automatizaciones vencidas", `${overdueDeliveries.length} entregas estan vencidas.`, "Ver vencidas", "/dashboard/automatizaciones?range=week");
  if (pendingProposalPrograms.length > 0) makeAlert(alerts, "warning", "Propuestas pendientes", `${pendingProposalPrograms.length} programa(s) tienen propuesta por aprobar.`, "Revisar propuestas", pendingProposalPrograms[0] ? `/dashboard/programas/${pendingProposalPrograms[0].id}/propuesta` : "/dashboard/programas");
  if (incompletePrograms.length > 0) makeAlert(alerts, "warning", "Programa incompleto", `${incompletePrograms[0].name} esta al ${incompletePrograms[0].completion}%.`, "Abrir programa", `/dashboard/programas/${incompletePrograms[0].id}`);
  if (weeks.some((week) => week.assignmentCount === 0 && !["ARCHIVED", "CANCELLED"].includes(week.status))) makeAlert(alerts, "info", "Semana sin asignaciones", "Hay semanas operativas sin asignaciones aprobadas.", "Ver semanas", "/dashboard/semanas");
  if (noPhonePublishers.length > 0) makeAlert(alerts, "warning", "Publicadores sin telefono", `${noPhonePublishers.length} publicador(es) no tienen telefono utilizable.`, "Ver publicadores", "/dashboard/publicadores");

  const flow = buildFlow(currentProgram, importedEventCount);
  const calendar = buildCalendar({
    monthStartLocal,
    todayLocal,
    timeZone: config.timezone,
    weeks: weeksRaw,
    deliveries: monthDeliveries,
    programs: programsRaw,
  });

  return {
    generatedAt: now.toISOString(),
    timezone: config.timezone,
    sendHour: config.sendHour,
    todayLocal,
    system: {
      database: { status: "connected", label: "Conectada" },
      worker: {
        status: workerAttention ? "attention" : "running",
        label: workerAttention ? "Revisar" : "Activo",
        lastEventAt: lastWorkerEvent?.createdAt || null,
      },
      scheduler: {
        status: "configured",
        label: "Configurado",
        schedule: process.env.CRON_SCHEDULE || "*/10 * * * *",
      },
      whatsapp,
      testMode: {
        enabled: testMode,
        phone: configMap.TEST_PHONE || process.env.TEST_PHONE || null,
      },
      lastSyncAt: now,
      lastMessage: lastMessage ? {
        id: lastMessage.id,
        status: lastMessage.status,
        at: lastMessage.sentAt || lastMessage.createdAt,
        publisherName: displayName(lastMessage.publisher),
        messageType: lastMessage.messageType,
      } : null,
    },
    programs: {
      active: activePrograms,
      pending: pendingPrograms,
      incomplete: incompletePrograms,
      archived: archivedPrograms.slice(0, 6),
      totals: {
        active: activePrograms.length,
        pending: pendingPrograms.length,
        incomplete: incompletePrograms.length,
        archived: archivedPrograms.length,
      },
    },
    weeks: {
      active: activeWeeks,
      pending: pendingWeeks,
      incomplete: incompleteWeeks,
      ready: readyWeeks,
      thisWeek,
      totals: {
        active: activeWeeks.length,
        pending: pendingWeeks.length,
        incomplete: incompleteWeeks.length,
        ready: readyWeeks.length,
      },
    },
    proposals: {
      pending: pendingProposalPrograms,
      approved: proposalApprovedCount,
      discarded: proposalDiscardedCount,
      totals: {
        pending: pendingProposalPrograms.length,
        approved: proposalApprovedCount,
        discarded: proposalDiscardedCount,
      },
    },
    automations: {
      today: summarizeDeliveries(todayDeliveries, config.timezone),
      tomorrow: summarizeDeliveries(tomorrowDeliveries, config.timezone),
      nextSeven: summarizeDeliveries(nextSevenDeliveries, config.timezone),
      overdue: summarizeDeliveries(overdueDeliveries, config.timezone),
      failed: summarizeDeliveries(failedDeliveries, config.timezone),
      cancelled: summarizeDeliveries(cancelledDeliveries, config.timezone),
    },
    publishers: {
      active: activePublishers.slice(0, 8).map((publisher) => ({ id: publisher.id, name: displayName(publisher) })),
      inactive: inactivePublishers.slice(0, 8).map((publisher) => ({ id: publisher.id, name: displayName(publisher) })),
      new: newPublishers.slice(0, 8).map((publisher) => ({ id: publisher.id, name: displayName(publisher) })),
      withoutPhone: noPhonePublishers.slice(0, 8).map((publisher) => ({ id: publisher.id, name: displayName(publisher) })),
      withoutAssignmentPermission: noAssignmentPermission.slice(0, 8).map((publisher) => ({ id: publisher.id, name: displayName(publisher) })),
      withoutCompanionPermission: noCompanionPermission.slice(0, 8).map((publisher) => ({ id: publisher.id, name: displayName(publisher) })),
      totals: {
        active: activePublishers.length,
        inactive: inactivePublishers.length,
        new: newPublishers.length,
        withoutPhone: noPhonePublishers.length,
        withoutAssignmentPermission: noAssignmentPermission.length,
        withoutCompanionPermission: noCompanionPermission.length,
      },
    },
    flow,
    alerts,
    calendar,
    answers: {
      today: todayDeliveries.length > 0 ? `${todayDeliveries.length} mensajes programados para hoy.` : "No hay mensajes programados para hoy.",
      wrong: alerts.length > 0 ? `${alerts.length} asunto(s) requieren atencion.` : "No hay errores operativos detectados.",
      next: flow.nextAction.label,
      completed: `${programs.filter((program) => program.status === "COMPLETED" || program.completion === 100).length} programa(s) completados o listos.`,
      attention: alerts[0]?.title || "Sin atencion urgente.",
    },
  };
}

