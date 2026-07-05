import { Router, Request, Response } from "express";
import { prisma, Prisma, ReminderRecipientRole, ReminderStatus, ReminderType } from "@jw-reminders/database";
import { addDaysToLocalDate, localDateLabel, localTimeLabel, localToday, zonedLocalTimeToUtc } from "../../services/date-utils.js";
import { createAutomationEvent, getAutomationConfig } from "../../services/automation.service.js";
import { renderReminderMessage } from "../../services/reminder-renderer.js";
import {
  generateSnapshots,
  previewDeliveryFrozen,
  editFinalMessage,
  regenerateFromTemplate,
  approveBatch,
} from "../../services/message-snapshot.service.js";
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
  // ponytail: immediate notices (INITIAL_NOTICE, CHANGE_NOTICE, CANCELLATION_NOTICE)
  // use scheduledAt = creation time. They're "in queue" not "overdue" unless >30min old.
  const IMMEDIATE_TYPES = ["INITIAL_NOTICE", "CHANGE_NOTICE", "CANCELLATION_NOTICE"];
  const OVERDUE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
  const isImmediate = IMMEDIATE_TYPES.includes(delivery.reminderType);
  const msSinceScheduled = now.getTime() - new Date(delivery.scheduledAt).getTime();
  const overdue = delivery.scheduledAt < now
    && isOpenNotSent(delivery.status)
    && (!isImmediate || msSinceScheduled > OVERDUE_THRESHOLD_MS);

  // Time condition for UI: helps frontend show better labels
  let timeCondition: string;
  if (delivery.status === "SENT" || delivery.status === "CANCELLED" || delivery.status === "SKIPPED") {
    timeCondition = "completed";
  } else if (delivery.scheduledAt > now) {
    timeCondition = "scheduled"; // future
  } else if (isImmediate && msSinceScheduled <= OVERDUE_THRESHOLD_MS) {
    timeCondition = "ready"; // in queue, waiting for worker cycle
  } else if (msSinceScheduled <= OVERDUE_THRESHOLD_MS) {
    timeCondition = "ready";
  } else if (msSinceScheduled <= 2 * 60 * 60 * 1000) {
    timeCondition = "delayed"; // >30min but <2h
  } else {
    timeCondition = "overdue_critical"; // >2h without processing
  }

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
    timeCondition,
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

    // ponytail: only count as overdue if >30min past scheduledAt (immediate notices aren't overdue right away)
    const IMMEDIATE_TYPES_OV = ["INITIAL_NOTICE", "CHANGE_NOTICE", "CANCELLATION_NOTICE"];
    const OVERDUE_MS = 30 * 60 * 1000;
    const overdue = open.filter((d) => {
      if (d.scheduledAt >= now) return false;
      const ms = now.getTime() - new Date(d.scheduledAt).getTime();
      if (IMMEDIATE_TYPES_OV.includes(d.reminderType) && ms <= OVERDUE_MS) return false;
      return ms > OVERDUE_MS;
    }).length;

    // Ready to send: pending and scheduledAt <= now but not yet overdue
    const readyToSend = open.filter((d) => {
      if (d.scheduledAt > now) return false;
      const ms = now.getTime() - new Date(d.scheduledAt).getTime();
      return ms <= OVERDUE_MS;
    }).length;

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
      readyToSend,
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

// ─── Operations status: estado operativo en tiempo real ───────────────────
// Alimenta el panel principal del Centro de Automatizaciones.
router.get("/operations-status", async (_req: Request, res: Response) => {
  try {
    const config = await getAutomationConfig(prisma);
    const tz = config.timezone;
    const now = new Date();
    const today = localToday(tz);
    const todayStart = zonedLocalTimeToUtc(today, 0, 0, tz);
    const todayEnd = zonedLocalTimeToUtc(addDaysToLocalDate(today, 1), 0, 0, tz);

    // Datos paralelos
    const [appConfigs, whatsappRes, lastWorkerEvent, lastPauseEvent, sentToday, outboxRecent, pendingCount, failedCount, sentCount, uncertainCount] = await Promise.all([
      prisma.appConfig.findMany({ where: { key: { in: ["SENDS_PAUSED", "TEST_MODE", "WORKER_PHASE"] } } }),
      fetch(`${process.env.WHATSAPP_API_URL || "http://jw-reminders-whatsapp:3010"}/status`).then((r) => r.json()).catch(() => ({ status: "DISCONNECTED" })),
      prisma.jwAutomationEvent.findFirst({ where: { actorType: "worker" }, orderBy: { createdAt: "desc" } }),
      prisma.jwAutomationEvent.findFirst({ where: { eventType: "SENDS_AUTO_PAUSED" }, orderBy: { createdAt: "desc" } }),
      prisma.reminderDelivery.count({ where: { status: "SENT", sentAt: { gte: todayStart, lt: todayEnd } } }),
      prisma.whatsappOutbox.findMany({ where: { status: "SENT" }, orderBy: { sentAt: "desc" }, take: 5 }),
      prisma.reminderDelivery.count({ where: { status: { in: ["PENDING", "READY", "QUEUED"] } } }),
      prisma.reminderDelivery.count({ where: { status: { in: ["FAILED", "DEAD"] } } }),
      prisma.reminderDelivery.count({ where: { status: "SENT" } }),
      prisma.reminderDelivery.count({ where: { status: "UNCERTAIN" } }),
    ]);

    const configMap = Object.fromEntries(appConfigs.map((c) => [c.key, c.value]));
    const paused = configMap.SENDS_PAUSED === "true";

    // Próximo mensaje listo
    const nextReady = await prisma.reminderDelivery.findFirst({
      where: { status: { in: ["PENDING", "READY"] }, scheduledAt: { lte: now } },
      include: { publisher: true },
      orderBy: { scheduledAt: "asc" },
    });

    // Agrupación real: cuántos mensajes WhatsApp se enviarán (1 por persona/semana/tipo)
    const pendingGroups = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(DISTINCT CONCAT("publisherId", '|', "assignmentId")) as count
      FROM "ReminderDelivery"
      WHERE status IN ('PENDING', 'READY', 'QUEUED')
    `.catch(() => [{ count: BigInt(0) }]);
    const whatsappMessagesToday = sentToday;

    // Calcular próximo envío
    let secondsUntilNextSend: number | null = null;
    if (nextReady && !paused && whatsappRes.status === "READY") {
      secondsUntilNextSend = 0; // listo ahora
    } else if (!paused && whatsappRes.status === "READY") {
      // Buscar el siguiente scheduledAt futuro (solo si es dentro de 24h)
      const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const nextFuture = await prisma.reminderDelivery.findFirst({
        where: { status: { in: ["PENDING", "READY"] }, scheduledAt: { gt: now, lte: next24h } },
        orderBy: { scheduledAt: "asc" },
        select: { scheduledAt: true },
      });
      if (nextFuture) {
        secondsUntilNextSend = Math.max(0, Math.round((nextFuture.scheduledAt.getTime() - now.getTime()) / 1000));
      }
    }

    // Último ACK recibido
    const lastAck = outboxRecent[0]?.ack ?? null;
    const lastAckPhone = outboxRecent[0]?.phone ?? null;
    const lastAckTime = outboxRecent[0]?.ackUpdatedAt ?? outboxRecent[0]?.sentAt ?? null;

    // Pause reason
    let pauseReason: string | null = null;
    let pauseSource: string | null = null;
    if (paused && lastPauseEvent) {
      const meta = lastPauseEvent.metadata as any;
      pauseReason = meta?.reason || "Pausa manual";
      pauseSource = meta?.phone ? `ACK=-1 en ${meta.phone}` : "auto-pausa";
    } else if (paused) {
      pauseReason = "Pausa manual";
      pauseSource = "manual";
    }

    res.json({
      serverNow: now.toISOString(),
      timezone: tz,
      whatsapp: {
        status: whatsappRes.status || "DISCONNECTED",
        connectedNumber: whatsappRes.connectedNumber || null,
        deviceName: whatsappRes.deviceName || null,
        lastConnected: whatsappRes.lastConnected || null,
        error: whatsappRes.error || null,
      },
      worker: {
        status: lastWorkerEvent ? "running" : "unknown",
        lastTickAt: lastWorkerEvent?.createdAt || null,
        cron: process.env.CRON_SCHEDULE || "*/10 * * * *",
      },
      // Estado en tiempo real del worker (fase actual)
      workerPhase: (() => {
        try {
          const raw = configMap.WORKER_PHASE;
          return raw ? JSON.parse(raw) : null;
        } catch { return null; }
      })(),
      queue: {
        paused,
        pauseReason,
        pauseSource,
        pausedAt: paused && lastPauseEvent ? lastPauseEvent.createdAt : null,
        nextSendAt: nextReady ? nextReady.scheduledAt : null,
        secondsUntilNextSend,
        nextPublisherName: nextReady?.publisher?.displayName || nextReady?.publisher?.fullName || null,
        nextPublisherPhone: nextReady?.publisher?.phone || null,
      },
      counts: {
        whatsappMessagesToday,
        pendingMessages: pendingCount,
        sentMessages: sentCount,
        failedMessages: failedCount,
        uncertainMessages: uncertainCount,
        estimatedWhatsappGroups: Number(pendingGroups[0]?.count ?? 0),
      },
      lastEvent: {
        type: lastWorkerEvent?.eventType || null,
        ack: lastAck,
        phone: lastAckPhone,
        time: lastAckTime,
        error: (lastWorkerEvent?.metadata as any)?.error || null,
      },
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Send groups: mensajes agrupados por publicador ──────────────────────
// Un "send group" = un mensaje WhatsApp real que puede contener 1+ asignaciones.
router.get("/send-groups", async (_req: Request, res: Response) => {
  try {
    const config = await getAutomationConfig(prisma);
    const tz = config.timezone;
    const now = new Date();
    const today = localToday(tz);
    const todayStart = zonedLocalTimeToUtc(today, 0, 0, tz);
    const weekEnd = zonedLocalTimeToUtc(addDaysToLocalDate(today, 7), 0, 0, tz);

    // Buscar deliveries de hoy y próximos 7 días, agrupados por persona (1 mensaje = 1 persona)
    const deliveries = await prisma.reminderDelivery.findMany({
      where: { scheduledAt: { gte: todayStart, lt: weekEnd }, status: { notIn: ["CANCELLED", "SKIPPED"] } },
      include: {
        publisher: true,
        assignment: { include: { meetingWeek: { include: { monthlySchedule: true } } } },
      },
      orderBy: { scheduledAt: "asc" },
      take: 200,
    });

    // Agrupar por publisherId solamente = 1 mensaje WhatsApp por persona
    // (el worker agrupa múltiples asignaciones de la misma persona en 1 solo mensaje)
    const groupMap = new Map<string, typeof deliveries>();
    for (const d of deliveries) {
      const key = d.publisherId;
      const group = groupMap.get(key) || [];
      group.push(d);
      groupMap.set(key, group);
    }

    const groups = Array.from(groupMap.values()).map((items) => {
      const first = items[0];
      const publisher = first.publisher;
      // Status del grupo: si ALGUNO está SENT, todo el grupo es SENT (porque se envía 1 solo msg)
      const hasSent = items.some((d) => d.status === "SENT");
      const hasFailed = items.some((d) => d.status === "FAILED" || d.status === "DEAD");
      const groupStatus = hasSent ? "SENT" : hasFailed ? "FAILED" : first.status;
      return {
        groupKey: first.publisherId,
        publisherName: publisher?.displayName || publisher?.fullName || "Sin publicador",
        phone: publisher?.whatsappPhone || publisher?.phone || null,
        reminderType: first.reminderType,
        programName: first.assignment?.meetingWeek?.monthlySchedule?.name || null,
        assignmentCount: items.length,
        assignments: items.map((d) => ({
          id: d.assignmentId,
          title: d.assignment?.title || "Sin asignacion",
          role: d.recipientRole,
        })),
        status: groupStatus,
        scheduledAt: first.scheduledAt,
        localTime: localTimeLabel(first.scheduledAt, tz),
        localDate: localDateLabel(first.scheduledAt, tz),
        deliveryIds: items.map((d) => d.id),
      };
    }).sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

    res.json({ groups, timezone: tz, generatedAt: now.toISOString() });
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

// ─── Cancelar TODOS los envíos pendientes de golpe ───────
router.post("/cancel-all-pending", async (_req: Request, res: Response) => {
  try {
    const result = await prisma.reminderDelivery.updateMany({
      where: { status: { in: ["PENDING", "READY", "QUEUED", "FAILED"] } },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: "bulk_cancelled_by_admin" },
    });
    await createAutomationEvent(prisma, {
      eventType: "BULK_CANCEL",
      entityType: "ReminderDelivery",
      entityId: "all",
      actorType: "admin",
      metadata: { count: result.count, reason: "bulk_cancelled_by_admin" },
    });
    res.json({ ok: true, cancelled: result.count });
  } catch (err) {
    res.status(500).json({ error: String(err) });
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
        assignment: { include: { assigned: true, companion: true, meetingWeek: true, programItem: true } },
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

// ─── Fase 4: snapshot congelado (generar / revisar / editar / regenerar / aprobar) ──

// Listar batches recientes (pantalla de revisión).
router.get("/batches", async (_req: Request, res: Response) => {
  const batches = await prisma.messageBatch.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  const withCounts = await Promise.all(
    batches.map(async (b) => {
      const deliveries = await prisma.reminderDelivery.findMany({
        where: { batchId: b.id },
        select: { publisherId: true, reminderType: true, renderedMessage: true, status: true, manuallyEdited: true },
      });
      const persons = new Set(deliveries.map((d) => `${d.publisherId}|${d.reminderType}|${d.renderedMessage ?? ""}`));
      return {
        id: b.id,
        type: b.type,
        periodLabel: b.periodLabel,
        status: b.status,
        createdAt: b.createdAt,
        approvedAt: b.approvedAt,
        messages: persons.size,
        deliveries: deliveries.length,
        edited: deliveries.filter((d) => d.manuallyEdited).length,
      };
    }),
  );
  res.json(withCounts);
});

// Generar y congelar snapshots de un alcance (mes o semana) en un batch DRAFT.
router.post("/batches/generate", async (req: Request, res: Response) => {
  try {
    const { reminderType, monthlyScheduleId, meetingWeekId, periodLabel } = req.body || {};
    if (!reminderType) return res.status(400).json({ error: "reminderType requerido" });
    const result = await generateSnapshots({ reminderType, monthlyScheduleId, meetingWeekId, periodLabel, createdBy: "admin" });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Ver un batch con sus mensajes congelados (pantalla de revisión).
router.get("/batches/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const batch = await prisma.messageBatch.findUniqueOrThrow({ where: { id: req.params.id } });
    const deliveries = await prisma.reminderDelivery.findMany({
      where: { batchId: batch.id },
      include: { publisher: true, assignment: { select: { assignmentNumber: true, title: true } } },
      orderBy: { scheduledAt: "asc" },
    });
    // Un mensaje por grupo persona/tipo: colapsamos por renderedMessage + publisher.
    const seen = new Set<string>();
    const messages = deliveries
      .filter((d) => {
        const k = `${d.publisherId}|${d.reminderType}|${d.renderedMessage ?? ""}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((d) => ({
        deliveryId: d.id,
        publisherName: d.publisher?.displayName || d.publisher?.fullName || "Sin publicador",
        phone: d.publisher?.whatsappPhone || d.publisher?.phone || null,
        reminderType: d.reminderType,
        status: d.status,
        scheduledAt: d.scheduledAt,
        manuallyEdited: d.manuallyEdited,
        renderedMessage: d.renderedMessage,
      }));
    res.json({ batch, count: messages.length, messages });
  } catch {
    res.status(404).json({ error: "Batch no encontrado" });
  }
});

// Preview FIEL del mensaje congelado que se enviaría (recalcula con render único).
router.get("/deliveries/:id/frozen-preview", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const delivery = await prisma.reminderDelivery.findUniqueOrThrow({ where: { id: req.params.id } });
    const preview = await previewDeliveryFrozen(req.params.id);
    res.json({
      id: delivery.id,
      status: delivery.status,
      reminderType: delivery.reminderType,
      manuallyEdited: delivery.manuallyEdited,
      // Lo que HAY guardado (snapshot) y lo que la plantilla actual produciría:
      savedRenderedMessage: delivery.renderedMessage,
      templatePreview: preview?.renderedMessage ?? null,
      warnings: preview?.warnings ?? [],
    });
  } catch {
    res.status(404).json({ error: "Entrega no encontrada" });
  }
});

// Editar el mensaje FINAL (marca manuallyEdited; afecta a las hermanas del grupo).
router.post("/deliveries/:id/edit-final", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const text = typeof req.body?.text === "string" ? req.body.text : "";
    if (!text.trim()) return res.status(400).json({ error: "text requerido" });
    const result = await editFinalMessage(req.params.id, text);
    await createAutomationEvent(prisma, {
      eventType: "REMINDER_FINAL_MESSAGE_EDITED",
      entityType: "ReminderDelivery",
      entityId: req.params.id,
      actorType: "admin",
      metadata: { affected: result.updated },
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// Regenerar el mensaje final desde la plantilla ACTIVA (descarta edición manual).
router.post("/deliveries/:id/regenerate", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const result = await regenerateFromTemplate(req.params.id);
    await createAutomationEvent(prisma, {
      eventType: "REMINDER_REGENERATED_FROM_TEMPLATE",
      entityType: "ReminderDelivery",
      entityId: req.params.id,
      actorType: "admin",
      metadata: { affected: result.updated },
    });
    res.json({ ok: true, updated: result.updated });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// Aprobar un batch: DRAFT → READY (listo para que el worker lo envíe).
router.post("/batches/:id/approve", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const result = await approveBatch(req.params.id);
    await createAutomationEvent(prisma, {
      eventType: "MESSAGE_BATCH_APPROVED",
      entityType: "MessageBatch",
      entityId: req.params.id,
      actorType: "admin",
      metadata: { approved: result.approved },
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

export default router;
