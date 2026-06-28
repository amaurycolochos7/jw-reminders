import { Router, Request, Response } from "express";
import { prisma, Prisma, ReminderRecipientRole, ReminderStatus, ReminderType } from "@jw-reminders/database";
import { addDaysToLocalDate, localDateLabel, localTimeLabel, localToday, zonedLocalTimeToUtc } from "../../services/date-utils.js";
import { createAutomationEvent, getAutomationConfig } from "../../services/automation.service.js";
import { renderReminderMessage } from "../../services/reminder-renderer.js";
import {
  canEditMessage,
  canSendNow,
  canReschedule,
  hasCustomMessage,
  resolveOutboundMessage,
  messageEditAuditMetadata,
  EDITABLE_MESSAGE_STATES,
  SEND_NOW_STATES,
  RESCHEDULE_STATES,
} from "@jw-reminders/shared";

const router = Router();

// Non-terminal, not-yet-sent statuses. These are what "overdue" looks at.
const OPEN_STATUSES: ReminderStatus[] = ["PENDING", "QUEUED", "FAILED"];

function isOpenNotSent(status: ReminderStatus): boolean {
  return status === "PENDING" || status === "QUEUED" || status === "FAILED" || status === "SENDING";
}

function monthRange(month: string | undefined, timeZone: string) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const nextYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  const endExclusive = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return {
    startUtc: zonedLocalTimeToUtc(start, 0, 0, timeZone),
    endUtc: zonedLocalTimeToUtc(endExclusive, 0, 0, timeZone),
    start,
    endExclusive,
  };
}

function rangeToDates(range: string | undefined, timeZone: string, dateFrom?: string, dateTo?: string) {
  const today = localToday(timeZone);
  let start = dateFrom || today;
  let endExclusive = dateTo ? addDaysToLocalDate(dateTo, 1) : addDaysToLocalDate(today, 1);

  if (range === "tomorrow") {
    start = addDaysToLocalDate(today, 1);
    endExclusive = addDaysToLocalDate(today, 2);
  } else if (range === "week") {
    start = today;
    endExclusive = addDaysToLocalDate(today, 7);
  } else if (range === "month") {
    start = today;
    endExclusive = addDaysToLocalDate(today, 31);
  } else if (range === "custom" && dateFrom && dateTo) {
    start = dateFrom;
    endExclusive = addDaysToLocalDate(dateTo, 1);
  }

  return {
    startUtc: zonedLocalTimeToUtc(start, 0, 0, timeZone),
    endUtc: zonedLocalTimeToUtc(endExclusive, 0, 0, timeZone),
    start,
    endExclusive,
  };
}

const deliveryInclude = {
  publisher: true,
  automationPlan: true,
  assignment: {
    include: {
      assigned: true,
      companion: true,
      meetingWeek: { include: { monthlySchedule: true } },
    },
  },
  messageLogs: { orderBy: { createdAt: "desc" as const }, take: 1 },
};

function mapDelivery(delivery: any, timeZone: string, now: Date) {
  const overdue = delivery.scheduledAt < now && isOpenNotSent(delivery.status);
  return {
    id: delivery.id,
    reminderType: delivery.reminderType,
    recipientRole: delivery.recipientRole,
    status: delivery.status,
    scheduledAt: delivery.scheduledAt,
    sentAt: delivery.sentAt,
    localDate: localDateLabel(delivery.scheduledAt, timeZone),
    localTime: localTimeLabel(delivery.scheduledAt, timeZone),
    overdue,
    attemptCount: delivery.attemptCount,
    maxAttempts: delivery.maxAttempts,
    nextRetryAt: delivery.nextRetryAt,
    errorMessage: delivery.errorMessage,
    publisher: delivery.publisher,
    assignment: delivery.assignment,
    lastAttempt: delivery.messageLogs?.[0] || null,
  };
}

// ─── Operative overview ──────────────────────────────────
router.get("/overview", async (_req: Request, res: Response) => {
  try {
    const config = await getAutomationConfig(prisma);
    const tz = config.timezone;
    const now = new Date();
    const today = localToday(tz);
    const todayStart = zonedLocalTimeToUtc(today, 0, 0, tz);
    const todayEnd = zonedLocalTimeToUtc(addDaysToLocalDate(today, 1), 0, 0, tz);
    const tomorrowEnd = zonedLocalTimeToUtc(addDaysToLocalDate(today, 2), 0, 0, tz);
    const weekEnd = zonedLocalTimeToUtc(addDaysToLocalDate(today, 7), 0, 0, tz);

    const [open, sentToday, failed] = await Promise.all([
      prisma.reminderDelivery.findMany({
        where: { status: { in: OPEN_STATUSES } },
        include: {
          publisher: true,
          assignment: { include: { meetingWeek: { include: { monthlySchedule: true } } } },
        },
      }),
      prisma.reminderDelivery.count({ where: { status: "SENT", sentAt: { gte: todayStart, lt: todayEnd } } }),
      prisma.reminderDelivery.count({ where: { status: { in: ["FAILED", "DEAD"] } } }),
    ]);

    const todayDeliveries = open.filter((d) => d.scheduledAt >= todayStart && d.scheduledAt < todayEnd);
    const tomorrowDeliveries = open.filter((d) => d.scheduledAt >= todayEnd && d.scheduledAt < tomorrowEnd);
    const overdue = open.filter((d) => d.scheduledAt < now).length;

    const programMap = new Map<string, { id: string; name: string; pending: number }>();
    for (const d of open) {
      const program = d.assignment?.meetingWeek?.monthlySchedule;
      if (!program) continue;
      const entry = programMap.get(program.id) || { id: program.id, name: program.name, pending: 0 };
      entry.pending += 1;
      programMap.set(program.id, entry);
    }

    const publisherMap = new Map<string, { publisherId: string; name: string; count: number; nextLocalDate: string }>();
    for (const d of open.filter((x) => x.scheduledAt >= todayStart && x.scheduledAt < weekEnd)) {
      const name = d.publisher?.displayName || d.publisher?.fullName || "Sin publicador";
      const localDate = localDateLabel(d.scheduledAt, tz);
      const entry = publisherMap.get(d.publisherId);
      if (entry) {
        entry.count += 1;
        if (localDate < entry.nextLocalDate) entry.nextLocalDate = localDate;
      } else {
        publisherMap.set(d.publisherId, { publisherId: d.publisherId, name, count: 1, nextLocalDate: localDate });
      }
    }

    res.json({
      timezone: tz,
      sendHour: config.sendHour,
      generatedAt: now.toISOString(),
      today: {
        pending: todayDeliveries.length,
        assigned: todayDeliveries.filter((d) => d.recipientRole === "ASSIGNED").length,
        companion: todayDeliveries.filter((d) => d.recipientRole === "COMPANION").length,
      },
      tomorrow: { pending: tomorrowDeliveries.length },
      overdue,
      failed,
      sentToday,
      programsWithPending: Array.from(programMap.values()).sort((a, b) => b.pending - a.pending),
      upcomingPublishers: Array.from(publisherMap.values()).sort((a, b) => a.nextLocalDate.localeCompare(b.nextLocalDate) || b.count - a.count).slice(0, 8),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Delivery detail with attempt history ────────────────
router.get("/deliveries/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const config = await getAutomationConfig(prisma);
    const now = new Date();
    const delivery = await prisma.reminderDelivery.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        ...deliveryInclude,
        messageLogs: { orderBy: { createdAt: "desc" } },
      },
    });

    const base = mapDelivery({ ...delivery, messageLogs: [delivery.messageLogs[0]] }, config.timezone, now);
    res.json({
      ...base,
      automationPlan: delivery.automationPlan
        ? { id: delivery.automationPlan.id, status: delivery.automationPlan.status, version: delivery.automationPlan.version }
        : null,
      attempts: delivery.messageLogs.map((log) => ({
        id: log.id,
        status: log.status,
        phone: log.phone,
        providerMessageId: log.providerMessageId,
        errorMessage: log.errorMessage,
        sentAt: log.sentAt,
        createdAt: log.createdAt,
        messageBody: log.messageBody,
      })),
    });
  } catch {
    res.status(404).json({ error: "Entrega no encontrada" });
  }
});

// ─── Retry a failed/dead delivery ────────────────────────
router.post("/deliveries/:id/retry", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const delivery = await prisma.reminderDelivery.findUniqueOrThrow({ where: { id: req.params.id } });
    if (delivery.status !== "FAILED" && delivery.status !== "DEAD") {
      return res.status(400).json({ error: "Solo se pueden reintentar entregas fallidas o agotadas" });
    }
    const updated = await prisma.reminderDelivery.update({
      where: { id: delivery.id },
      data: {
        status: "PENDING",
        attemptCount: 0,
        errorMessage: null,
        deadAt: null,
        nextRetryAt: null,
        scheduledAt: new Date(),
      },
    });
    await createAutomationEvent(prisma, {
      eventType: "REMINDER_RETRY_REQUESTED",
      entityType: "ReminderDelivery",
      entityId: delivery.id,
      actorType: "admin",
      metadata: { previousStatus: delivery.status },
    });
    res.json({ ok: true, status: updated.status });
  } catch {
    res.status(404).json({ error: "Entrega no encontrada" });
  }
});

// ─── Cancel a pending delivery ───────────────────────────
router.post("/deliveries/:id/cancel", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const delivery = await prisma.reminderDelivery.findUniqueOrThrow({ where: { id: req.params.id } });
    if (!["PENDING", "QUEUED", "FAILED"].includes(delivery.status)) {
      return res.status(400).json({ error: "Solo se pueden cancelar entregas pendientes" });
    }
    const updated = await prisma.reminderDelivery.update({
      where: { id: delivery.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "cancelled_by_admin" },
    });
    await createAutomationEvent(prisma, {
      eventType: "REMINDER_CANCELLED",
      entityType: "ReminderDelivery",
      entityId: delivery.id,
      actorType: "admin",
      metadata: { previousStatus: delivery.status, reason: "cancelled_by_admin" },
    });
    res.json({ ok: true, status: updated.status });
  } catch {
    res.status(404).json({ error: "Entrega no encontrada" });
  }
});

// ─── Main list (grouped by day) ──────────────────────────
router.get("/", async (req: Request, res: Response) => {
  const config = await getAutomationConfig(prisma);
  const tz = config.timezone;
  const now = new Date();
  const { range, status, role, publisherId, monthlyScheduleId, meetingWeekId, reminderType, dateFrom, dateTo, month } = req.query;

  const statusValue = status ? (String(status).toUpperCase() as ReminderStatus) : undefined;
  const roleValue = role ? (String(role).toUpperCase() as ReminderRecipientRole) : undefined;
  const typeValue = reminderType ? (String(reminderType).toUpperCase() as ReminderType) : undefined;

  const filters: any = {
    ...(roleValue ? { recipientRole: roleValue } : {}),
    ...(publisherId ? { publisherId: publisherId as string } : {}),
    ...(typeValue ? { reminderType: typeValue } : {}),
    ...(meetingWeekId ? { assignment: { meetingWeekId: meetingWeekId as string } } : {}),
    ...(monthlyScheduleId ? { assignment: { meetingWeek: { monthlyScheduleId: monthlyScheduleId as string } } } : {}),
  };

  let where: any;
  let rangeMeta: any;

  if (range === "overdue") {
    where = {
      scheduledAt: { lt: now },
      status: statusValue ? statusValue : { in: OPEN_STATUSES },
      ...filters,
    };
    rangeMeta = { mode: "overdue", timezone: tz };
  } else {
    const dates = monthRange(month as string | undefined, tz) || rangeToDates(range as string | undefined, tz, dateFrom as string | undefined, dateTo as string | undefined);
    where = {
      scheduledAt: { gte: dates.startUtc, lt: dates.endUtc },
      ...(statusValue ? { status: statusValue } : {}),
      ...filters,
    };
    rangeMeta = { start: dates.start, endExclusive: dates.endExclusive, timezone: tz, month: monthRange(month as string | undefined, tz) ? month : undefined };
  }

  const deliveries = await prisma.reminderDelivery.findMany({
    where,
    include: deliveryInclude,
    orderBy: { scheduledAt: "asc" },
  });

  const mapped = deliveries.map((d) => mapDelivery(d, tz, now));

  const summary = mapped.reduce(
    (acc, d) => {
      const key = d.status.toLowerCase() as keyof typeof acc;
      if (key in acc) (acc[key] as number) += 1;
      if (d.overdue) acc.overdue += 1;
      return acc;
    },
    { pending: 0, queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0, cancelled: 0, dead: 0, overdue: 0 },
  );

  const grouped = new Map<string, any[]>();
  for (const item of mapped) {
    grouped.set(item.localDate, [...(grouped.get(item.localDate) || []), item]);
  }

  const todayLocal = localToday(tz);
  const tomorrowLocal = addDaysToLocalDate(todayLocal, 1);

  res.json({
    range: rangeMeta,
    summary,
    groups: Array.from(grouped.entries()).map(([localDate, items]) => ({
      localDate,
      label: localDate === todayLocal ? "HOY" : localDate === tomorrowLocal ? "MANANA" : localDate,
      deliveries: items,
    })),
  });
});

// ─── Entregas de una semana (panel embebido en la semana) ──
router.get("/deliveries/by-week/:weekId", async (req: Request<{ weekId: string }>, res: Response) => {
  try {
    const config = await getAutomationConfig(prisma);
    const tz = config.timezone;
    const now = new Date();
    const deliveries = await prisma.reminderDelivery.findMany({
      where: { assignment: { meetingWeekId: req.params.weekId } },
      include: {
        publisher: true,
        assignment: { select: { id: true, assignmentNumber: true, title: true } },
      },
      orderBy: { scheduledAt: "asc" },
    });

    const items = deliveries.map((d) => ({
      id: d.id,
      assignmentId: d.assignmentId,
      assignmentNumber: d.assignment?.assignmentNumber ?? null,
      assignmentTitle: d.assignment?.title ?? null,
      reminderType: d.reminderType,
      recipientRole: d.recipientRole,
      status: d.status,
      scheduledAt: d.scheduledAt,
      sentAt: d.sentAt,
      localDate: localDateLabel(d.scheduledAt, tz),
      localTime: localTimeLabel(d.scheduledAt, tz),
      overdue: d.scheduledAt < now && (d.status === "PENDING" || d.status === "FAILED"),
      attemptCount: d.attemptCount,
      maxAttempts: d.maxAttempts,
      errorMessage: d.errorMessage,
      cancelReason: d.cancelReason,
      hasCustomMessage: hasCustomMessage(d.customMessage),
      publisherName: d.publisher?.displayName || d.publisher?.fullName || "Sin publicador",
      canEditMessage: canEditMessage(d.status),
      canSendNow: canSendNow(d.status),
      canReschedule: canReschedule(d.status),
      canRetry: d.status === "FAILED" || d.status === "DEAD",
      canCancel: ["PENDING", "QUEUED", "FAILED"].includes(d.status),
    }));

    const summary = items.reduce(
      (acc, d) => {
        if (d.status === "PENDING" || d.status === "QUEUED" || d.status === "SENDING") acc.pending += 1;
        else if (d.status === "SENT") acc.sent += 1;
        else if (d.status === "CANCELLED") acc.cancelled += 1;
        else if (d.status === "FAILED" || d.status === "DEAD") acc.failed += 1;
        else if (d.status === "SKIPPED") acc.skipped += 1;
        return acc;
      },
      { total: items.length, pending: 0, sent: 0, cancelled: 0, failed: 0, skipped: 0 },
    );

    res.json({ timezone: tz, summary, deliveries: items });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Preview del mensaje (render desde plantilla + customMessage si existe) ──
router.get("/deliveries/:id/preview", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const delivery = await prisma.reminderDelivery.findUniqueOrThrow({
      where: { id: req.params.id },
      include: {
        publisher: true,
        assignment: { include: { assigned: true, companion: true, meetingWeek: true } },
      },
    });
    const templateMessage = await renderReminderMessage(delivery);
    res.json({
      id: delivery.id,
      status: delivery.status,
      reminderType: delivery.reminderType,
      hasCustomMessage: hasCustomMessage(delivery.customMessage),
      customMessage: delivery.customMessage,
      templateMessage,
      // Lo que realmente se enviaría hoy:
      effectiveMessage: resolveOutboundMessage(delivery.customMessage, templateMessage),
      canEditMessage: canEditMessage(delivery.status),
      canSendNow: canSendNow(delivery.status),
      canReschedule: canReschedule(delivery.status),
    });
  } catch {
    res.status(404).json({ error: "Entrega no encontrada" });
  }
});

// ─── Editar / restaurar mensaje personalizado ───────────
router.post("/deliveries/:id/message", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const delivery = await prisma.reminderDelivery.findUniqueOrThrow({ where: { id: req.params.id } });
    if (!canEditMessage(delivery.status)) {
      return res.status(400).json({
        error: `Solo se puede editar el mensaje cuando la entrega esta en ${EDITABLE_MESSAGE_STATES.join(" o ")} (estado actual: ${delivery.status}).`,
      });
    }

    const raw = typeof req.body?.customMessage === "string" ? req.body.customMessage : null;
    const trimmed = raw && raw.trim().length > 0 ? raw : null; // null/empty => restaurar plantilla

    const updated = await prisma.reminderDelivery.update({
      where: { id: delivery.id },
      data: { customMessage: trimmed },
    });

    await createAutomationEvent(prisma, {
      eventType: trimmed ? "REMINDER_MESSAGE_EDITED" : "REMINDER_MESSAGE_RESTORED",
      entityType: "ReminderDelivery",
      entityId: delivery.id,
      actorType: "admin",
      metadata: messageEditAuditMetadata({
        previousStatus: delivery.status,
        hadCustomMessageBefore: hasCustomMessage(delivery.customMessage),
        hasCustomMessageAfter: hasCustomMessage(trimmed),
      }) as Prisma.InputJsonObject,
    });

    res.json({ ok: true, hasCustomMessage: hasCustomMessage(updated.customMessage) });
  } catch {
    res.status(404).json({ error: "Entrega no encontrada" });
  }
});

// ─── Enviar ahora (adelanta el envio en el proximo tick) ─
router.post("/deliveries/:id/send-now", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const delivery = await prisma.reminderDelivery.findUniqueOrThrow({ where: { id: req.params.id } });
    if (!canSendNow(delivery.status)) {
      return res.status(400).json({
        error: `Solo se puede enviar ahora cuando la entrega esta en ${SEND_NOW_STATES.join(" o ")} (estado actual: ${delivery.status}).`,
      });
    }
    const updated = await prisma.reminderDelivery.update({
      where: { id: delivery.id },
      // Nunca tocamos QUEUED/SENDING, asi que no hay riesgo de envio doble.
      data: { status: "PENDING", scheduledAt: new Date(), nextRetryAt: null, errorMessage: null },
    });
    await createAutomationEvent(prisma, {
      eventType: "REMINDER_SEND_NOW_REQUESTED",
      entityType: "ReminderDelivery",
      entityId: delivery.id,
      actorType: "admin",
      metadata: { previousStatus: delivery.status },
    });
    res.json({ ok: true, status: updated.status, scheduledAt: updated.scheduledAt });
  } catch {
    res.status(404).json({ error: "Entrega no encontrada" });
  }
});

// ─── Reprogramar (cambiar fecha/hora de envio) ───────────
router.post("/deliveries/:id/reschedule", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const delivery = await prisma.reminderDelivery.findUniqueOrThrow({ where: { id: req.params.id } });
    if (!canReschedule(delivery.status)) {
      return res.status(400).json({
        error: `Solo se puede reprogramar cuando la entrega esta en ${RESCHEDULE_STATES.join(" o ")} (estado actual: ${delivery.status}).`,
      });
    }
    const when = req.body?.scheduledAt ? new Date(req.body.scheduledAt) : null;
    if (!when || Number.isNaN(when.getTime())) {
      return res.status(400).json({ error: "Fecha/hora invalida para reprogramar." });
    }
    const updated = await prisma.reminderDelivery.update({
      where: { id: delivery.id },
      data: { status: "PENDING", scheduledAt: when, nextRetryAt: null },
    });
    await createAutomationEvent(prisma, {
      eventType: "REMINDER_RESCHEDULED",
      entityType: "ReminderDelivery",
      entityId: delivery.id,
      actorType: "admin",
      metadata: { previousStatus: delivery.status, scheduledAt: when.toISOString() },
    });
    res.json({ ok: true, status: updated.status, scheduledAt: updated.scheduledAt });
  } catch {
    res.status(404).json({ error: "Entrega no encontrada" });
  }
});

export default router;
