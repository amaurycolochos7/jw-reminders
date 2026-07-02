import { Prisma, prisma, ReminderStatus, ReminderType } from "@jw-reminders/database";
import {
  WHATSAPP_SEND_DELAY_MIN_MS,
  WHATSAPP_SEND_DELAY_MAX_MS,
  WORKER_MAX_SENDS_PER_RUN,
  randomSendDelayMs,
  resolveOutboundMessage,
  classifyNotification,
  buildGroupedPersonMessage,
  buildMonthlyInitialMessage,
  formatMeetingTime,
  formatDateSpanish,
} from "@jw-reminders/shared";
import { renderReminderMessage } from "../services/template-renderer.js";
import { sendWhatsappMessage } from "../services/whatsapp-client.js";
import { groupDeliveries } from "../services/grouping.js";

const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE || 50);

/**
 * Send configuration. Source of truth is AppConfig (DB), set from the admin panel.
 * Falls back to environment variables when a value is missing/invalid.
 * Read on every run so changes apply on the next cron tick without a redeploy.
 *
 * Incluye la configuración anti-baneo (jitter de envío + tope por tick),
 * configurable por env sin necesidad de redeploy de código.
 */
type SendConfig = {
  testMode: boolean;
  testPhone: string;
  delayMinMs: number;
  delayMaxMs: number;
  maxSendsPerRun: number;
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = Number(raw);
  return raw !== undefined && Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function getSendConfig(): Promise<SendConfig> {
  let testMode = process.env.TEST_MODE === "true";
  let testPhone = process.env.TEST_PHONE || "";
  try {
    const rows = await prisma.appConfig.findMany({ where: { key: { in: ["TEST_MODE", "TEST_PHONE"] } } });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    if (map.TEST_MODE === "true") testMode = true;
    else if (map.TEST_MODE === "false") testMode = false;
    if (typeof map.TEST_PHONE === "string" && map.TEST_PHONE.trim()) testPhone = map.TEST_PHONE.trim();
  } catch (err) {
    console.error("[Worker] Failed to read AppConfig, using env fallback for send config:", err);
  }

  // Anti-baneo: rango de pausa aleatoria y tope de envíos por ejecución.
  let delayMinMs = envInt("WHATSAPP_SEND_DELAY_MIN_MS", WHATSAPP_SEND_DELAY_MIN_MS);
  let delayMaxMs = envInt("WHATSAPP_SEND_DELAY_MAX_MS", WHATSAPP_SEND_DELAY_MAX_MS);
  if (delayMaxMs < delayMinMs) delayMaxMs = delayMinMs; // rango coherente
  const maxSendsPerRun = envInt("WORKER_MAX_SENDS_PER_RUN", WORKER_MAX_SENDS_PER_RUN);

  return { testMode, testPhone, delayMinMs, delayMaxMs, maxSendsPerRun };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(nextAttempt: number) {
  if (nextAttempt <= 2) return 10 * 60 * 1000;
  return 30 * 60 * 1000;
}

async function event(eventType: string, entityType: string, entityId: string, metadata: Prisma.InputJsonObject = {}) {
  await prisma.jwAutomationEvent.create({
    data: {
      eventType,
      entityType,
      entityId,
      actorType: "worker",
      metadata,
    },
  });
}

function isSpecialNotice(type: ReminderType) {
  return type === "CHANGE_NOTICE" || type === "CANCELLATION_NOTICE";
}

async function markSkipped(id: string, reason: string) {
  await prisma.reminderDelivery.update({
    where: { id },
    data: { status: "SKIPPED", errorMessage: reason },
  });
  await event("REMINDER_SKIPPED", "ReminderDelivery", id, { reason });
}

async function markCancelled(id: string, reason: string) {
  await prisma.reminderDelivery.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
  });
  await event("REMINDER_CANCELLED", "ReminderDelivery", id, { reason });
}

// Include compartido por el fetch inicial y los refetch. Se añade `programItem`
// (opción de consulta, NO cambio de esquema) para conocer el sortOrder del
// programa y ordenar las partes en el mensaje agrupado.
const DELIVERY_INCLUDE = {
  automationPlan: true,
  assignment: { include: { meetingWeek: { include: { monthlySchedule: true } }, assigned: true, companion: true, programItem: true } },
  publisher: true,
} satisfies Prisma.ReminderDeliveryInclude;

type FreshDelivery = Prisma.ReminderDeliveryGetPayload<{ include: typeof DELIVERY_INCLUDE }>;

/** Teléfono de destino, respetando TEST_MODE igual que el flujo original. */
function resolvePhone(publisher: { whatsappPhone: string | null; phone: string }, sendConfig: SendConfig): string {
  return sendConfig.testMode ? sendConfig.testPhone : (publisher.whatsappPhone || publisher.phone);
}

/**
 * Validaciones terminales por delivery (idénticas al flujo original). Aplica el
 * efecto terminal correspondiente (DEAD/SKIPPED/CANCELLED/dedup) y devuelve
 * `false` cuando el delivery NO debe enviarse. Se ejecuta sobre el registro ya
 * reclamado (status QUEUED).
 */
async function validateFresh(fresh: FreshDelivery): Promise<boolean> {
  const { automationPlan, assignment, publisher } = fresh;
  const special = isSpecialNotice(fresh.reminderType);

  if (fresh.attemptCount >= fresh.maxAttempts) {
    await prisma.reminderDelivery.update({
      where: { id: fresh.id },
      data: { status: "DEAD", deadAt: new Date(), errorMessage: fresh.errorMessage || "Max attempts reached" },
    });
    await event("REMINDER_DEAD", "ReminderDelivery", fresh.id, { attemptCount: fresh.attemptCount });
    return false;
  }
  if (!automationPlan) {
    await markSkipped(fresh.id, "Missing automation plan");
    return false;
  }
  if (!assignment) {
    await markSkipped(fresh.id, "Missing assignment");
    return false;
  }
  if (!publisher) {
    await markSkipped(fresh.id, "Missing publisher");
    return false;
  }
  if (automationPlan.status === "SUPERSEDED" && !special) {
    await markCancelled(fresh.id, "Automation plan superseded");
    return false;
  }
  if (automationPlan.status === "CANCELLED" && !special) {
    await markCancelled(fresh.id, "Automation plan cancelled");
    return false;
  }
  if (automationPlan.status === "ARCHIVED" && !special) {
    await markSkipped(fresh.id, "Automation plan archived");
    return false;
  }
  if ((assignment.meetingWeek.status === "CANCELLED" || assignment.meetingWeek.status === "ARCHIVED") && !special) {
    await markCancelled(fresh.id, "Meeting week not active");
    return false;
  }
  if (assignment.status === "CANCELLED" && fresh.reminderType !== "CANCELLATION_NOTICE") {
    await markCancelled(fresh.id, "Assignment cancelled");
    return false;
  }
  if (assignment.status === "COMPLETED" && !special) {
    await markCancelled(fresh.id, "Assignment completed");
    return false;
  }
  if (!publisher.isActive || publisher.deletedAt || !publisher.canReceiveAssignments) {
    await markSkipped(fresh.id, "Publisher inactive or cannot receive messages");
    return false;
  }

  // ── Deduplicación con NotificationLog ──
  // El primer aviso (FIRST_ASSIGNMENT) se envía UNA sola vez por
  // (asignación, persona). Los recordatorios tienen clave propia y no se bloquean.
  const notif = classifyNotification(fresh.reminderType);
  if (notif.type === "FIRST_ASSIGNMENT") {
    const already = await prisma.notificationLog.findUnique({
      where: {
        assignmentId_recipientPersonId_notificationKey: {
          assignmentId: assignment.id,
          recipientPersonId: publisher.id,
          notificationKey: notif.key,
        },
      },
    });
    if (already && already.status === "SENT") {
      await markSkipped(fresh.id, "Primer aviso ya enviado (NotificationLog)");
      return false;
    }
  }

  return true;
}

/** Registra JwMessageLog + upsert NotificationLog para un delivery enviado. */
async function recordDeliveryAudit(
  fresh: FreshDelivery,
  phone: string,
  message: string,
  result: { success: boolean; messageId?: string; error?: string },
) {
  const { assignment, publisher, automationPlan } = fresh;
  const notif = classifyNotification(fresh.reminderType);

  await prisma.jwMessageLog.create({
    data: {
      assignmentId: assignment!.id,
      publisherId: publisher!.id,
      automationPlanId: automationPlan!.id,
      reminderDeliveryId: fresh.id,
      phone,
      messageType: fresh.reminderType,
      messageBody: message,
      providerMessageId: result.messageId || undefined,
      status: result.success ? "SENT" : "FAILED",
      errorMessage: result.error || undefined,
      sentAt: result.success ? new Date() : undefined,
    },
  });
  await event("MESSAGE_ATTEMPT_CREATED", "ReminderDelivery", fresh.id, {
    success: result.success,
    attemptCount: fresh.attemptCount + 1,
  });

  await prisma.notificationLog.upsert({
    where: {
      assignmentId_recipientPersonId_notificationKey: {
        assignmentId: assignment!.id,
        recipientPersonId: publisher!.id,
        notificationKey: notif.key,
      },
    },
    create: {
      assignmentId: assignment!.id,
      recipientPersonId: publisher!.id,
      notificationType: notif.type,
      notificationKey: notif.key,
      status: result.success ? "SENT" : "FAILED",
      sentAt: result.success ? new Date() : null,
      whatsappMessageId: result.messageId || null,
      errorMessage: result.error || null,
    },
    update: {
      notificationType: notif.type,
      status: result.success ? "SENT" : "FAILED",
      sentAt: result.success ? new Date() : null,
      whatsappMessageId: result.messageId || null,
      errorMessage: result.error || null,
    },
  });
}

/** Actualiza el estado final (SENT / FAILED / DEAD) de un delivery + eventos. */
async function finalizeDeliveryStatus(
  fresh: FreshDelivery,
  result: { success: boolean; error?: string },
) {
  const attemptCount = fresh.attemptCount + 1;
  const terminalFailure = !result.success && attemptCount >= fresh.maxAttempts;
  const failedStatus: ReminderStatus = terminalFailure ? "DEAD" : "FAILED";

  if (result.success) {
    await prisma.reminderDelivery.update({
      where: { id: fresh.id },
      data: { status: "SENT", attemptCount, sentAt: new Date(), errorMessage: null, nextRetryAt: null },
    });
    await event("REMINDER_SENT", "ReminderDelivery", fresh.id, { attemptCount });
  } else {
    const nextRetryAt = terminalFailure ? null : new Date(Date.now() + retryDelayMs(attemptCount + 1));
    await prisma.reminderDelivery.update({
      where: { id: fresh.id },
      data: {
        status: failedStatus,
        attemptCount,
        errorMessage: result.error || "Unknown WhatsApp error",
        nextRetryAt,
        deadAt: terminalFailure ? new Date() : null,
      },
    });
    await event("REMINDER_FAILED", "ReminderDelivery", fresh.id, { attemptCount, terminal: terminalFailure, error: result.error });
    if (terminalFailure) {
      await event("REMINDER_DEAD", "ReminderDelivery", fresh.id, { attemptCount });
    } else {
      await event("REMINDER_RETRY_SCHEDULED", "ReminderDelivery", fresh.id, { attemptCount, nextRetryAt });
    }
  }
}

/**
 * Envío INDIVIDUAL (comportamiento original, byte a byte): usa la plantilla
 * editable renderReminderMessage + customMessage. Se usa para grupos de 1 parte,
 * avisos especiales y deliveries con customMessage. `fresh` ya está validado.
 */
async function performSingleSend(fresh: FreshDelivery, sendConfig: SendConfig) {
  const phone = resolvePhone(fresh.publisher!, sendConfig);
  if (!phone) {
    await markSkipped(fresh.id, sendConfig.testMode ? "TEST_MODE activo pero TEST_PHONE no configurado" : "Destinatario sin telefono valido");
    return;
  }

  await prisma.reminderDelivery.update({
    where: { id: fresh.id },
    data: { status: "SENDING", lastAttemptAt: new Date() },
  });
  await event("REMINDER_SENDING", "ReminderDelivery", fresh.id, { reminderType: fresh.reminderType });

  const templateMessage = await renderReminderMessage({ ...fresh, reminderDay: fresh.reminderType });
  const message = resolveOutboundMessage(fresh.customMessage, templateMessage);
  const result = await sendWhatsappMessage(phone, message);

  await recordDeliveryAudit(fresh, phone, message, result);
  await finalizeDeliveryStatus(fresh, result);
  // Anti-baneo: pausa ALEATORIA entre mensajes (jitter) en lugar de fija.
  await delay(randomSendDelayMs(sendConfig.delayMinMs, sendConfig.delayMaxMs));
}

/**
 * Envío AGRUPADO (Fase 3, Opción A): una persona con VARIAS partes en la misma
 * semana + mismo bucket recibe UN SOLO mensaje. `deliveries` ya están validados y
 * comparten publisher/semana/reminderType. Todos comparten el mismo
 * providerMessageId y el mismo resultado (éxito/fallo).
 */
async function performGroupedSend(deliveries: FreshDelivery[], sendConfig: SendConfig) {
  const first = deliveries[0];
  const publisher = first.publisher!;
  const meetingWeek = first.assignment!.meetingWeek;
  const phone = resolvePhone(publisher, sendConfig);

  if (!phone) {
    const reason = sendConfig.testMode ? "TEST_MODE activo pero TEST_PHONE no configurado" : "Destinatario sin telefono valido";
    for (const d of deliveries) await markSkipped(d.id, reason);
    return;
  }

  // Partes ordenadas por el programa (sortOrder del MeetingProgramItem; si la
  // asignación no tiene programItem, se usa assignmentNumber como respaldo).
  const parts = deliveries.map((d) => ({
    title: d.assignment!.title,
    sortOrder: d.assignment!.programItem?.sortOrder ?? d.assignment!.assignmentNumber,
  }));

  const message = buildGroupedPersonMessage({
    personName: publisher.displayName || publisher.fullName,
    meetingDateText: formatDateSpanish(meetingWeek.meetingDate),
    meetingTimeText: meetingWeek.meetingTime,
    parts,
    // Solo el aviso inicial agrupado lleva el ánimo a prepararse con anticipación.
    includeEncouragement: first.reminderType === "INITIAL_NOTICE",
  });

  await prisma.reminderDelivery.updateMany({
    where: { id: { in: deliveries.map((d) => d.id) } },
    data: { status: "SENDING", lastAttemptAt: new Date() },
  });
  for (const d of deliveries) {
    await event("REMINDER_SENDING", "ReminderDelivery", d.id, { reminderType: d.reminderType, grouped: deliveries.length });
  }

  const result = await sendWhatsappMessage(phone, message);

  // Un JwMessageLog por delivery apuntando al MISMO providerMessageId: conserva
  // la trazabilidad por asignación (reminderDeliveryId/assignmentId) sin perder el
  // vínculo de que fue un único mensaje físico. NotificationLog por asignación.
  for (const d of deliveries) {
    await recordDeliveryAudit(d, phone, message, result);
  }
  for (const d of deliveries) {
    await finalizeDeliveryStatus(d, result);
  }

  // Anti-baneo: pausa ALEATORIA entre mensajes (jitter) en lugar de fija.
  await delay(randomSendDelayMs(sendConfig.delayMinMs, sendConfig.delayMaxMs));
}

const MESES_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
function monthLabelFor(fresh: FreshDelivery): string {
  const sched = fresh.assignment!.meetingWeek.monthlySchedule;
  if (sched?.name) return sched.name;
  const d = fresh.assignment!.meetingWeek.meetingDate;
  return `${MESES_ES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * AVISO INICIAL MENSUAL: un solo mensaje por persona con TODAS sus asignaciones
 * del mes (todas las semanas), agrupadas por fecha de reunión, marcando el rol
 * de acompañante. `deliveries` comparten publisher + mes + INITIAL_NOTICE.
 */
async function performMonthlyInitialSend(deliveries: FreshDelivery[], sendConfig: SendConfig) {
  const first = deliveries[0];
  const publisher = first.publisher!;
  const phone = resolvePhone(publisher, sendConfig);
  if (!phone) {
    const reason = sendConfig.testMode ? "TEST_MODE activo pero TEST_PHONE no configurado" : "Destinatario sin telefono valido";
    for (const d of deliveries) await markSkipped(d.id, reason);
    return;
  }

  const items = deliveries.map((d) => {
    const w = d.assignment!.meetingWeek;
    return {
      meetingDateText: formatDateSpanish(w.meetingDate),
      meetingTimeText: w.meetingTime,
      sortDate: w.meetingDateLocal || w.meetingDate.toISOString().slice(0, 10),
      sortOrder: d.assignment!.programItem?.sortOrder ?? d.assignment!.assignmentNumber,
      assignmentNumber: d.assignment!.assignmentNumber,
      title: d.assignment!.title,
      durationMinutes: d.assignment!.durationMinutes,
      isCompanion: d.recipientRole === "COMPANION",
    };
  });

  const message = buildMonthlyInitialMessage({
    personName: publisher.displayName || publisher.fullName,
    monthLabel: monthLabelFor(first),
    items,
  });

  await prisma.reminderDelivery.updateMany({
    where: { id: { in: deliveries.map((d) => d.id) } },
    data: { status: "SENDING", lastAttemptAt: new Date() },
  });
  for (const d of deliveries) {
    await event("REMINDER_SENDING", "ReminderDelivery", d.id, { reminderType: d.reminderType, monthly: deliveries.length });
  }

  const result = await sendWhatsappMessage(phone, message);
  for (const d of deliveries) await recordDeliveryAudit(d, phone, message, result);
  for (const d of deliveries) await finalizeDeliveryStatus(d, result);

  await delay(randomSendDelayMs(sendConfig.delayMinMs, sendConfig.delayMaxMs));
}

/**
 * Reclama atómicamente los deliveries del grupo, uno a uno por (id, statusEsperado).
 * updateMany es atómico a nivel de fila: sólo el tick que transiciona la fila de
 * su status vencido -> QUEUED obtiene count===1, por lo que sabemos EXACTAMENTE
 * qué filas nos pertenecen y evitamos doble envío si otro tick corre en paralelo.
 * (Un único updateMany masivo no devuelve las filas afectadas, así que no permite
 * distinguir la propiedad bajo concurrencia; por eso se reclama fila por fila.)
 */
async function claimGroup(group: FreshDelivery[]): Promise<string[]> {
  const claimedIds: string[] = [];
  for (const d of group) {
    const claimed = await prisma.reminderDelivery.updateMany({
      where: { id: d.id, status: d.status },
      data: { status: "QUEUED" },
    });
    if (claimed.count === 1) {
      claimedIds.push(d.id);
      await event("REMINDER_QUEUED", "ReminderDelivery", d.id, {
        previousStatus: d.status,
        reminderType: d.reminderType,
      });
    }
  }
  return claimedIds;
}

/** ¿Puede el grupo enviarse como UN mensaje agrupado con buildGroupedPersonMessage? */
function isGroupCombinable(group: FreshDelivery[]): boolean {
  if (group.length < 2) return false;
  // Los avisos especiales (cambio/cancelación) no comparten el texto genérico de
  // "recordatorio de asignaciones": conservan su plantilla individual.
  if (isSpecialNotice(group[0].reminderType)) return false;
  // customMessage es un override por delivery que debe respetarse individualmente.
  if (group.some((d) => typeof d.customMessage === "string" && d.customMessage.trim().length > 0)) return false;
  return true;
}

export async function processReminders() {
  const now = new Date();
  const sendConfig = await getSendConfig();
  const due = await prisma.reminderDelivery.findMany({
    where: {
      OR: [
        { status: "PENDING", scheduledAt: { lte: now } },
        { status: "FAILED", nextRetryAt: { lte: now } },
      ],
    },
    include: DELIVERY_INCLUDE,
    orderBy: { scheduledAt: "asc" },
    take: BATCH_SIZE,
  });

  if (due.length === 0) {
    console.log("[Worker] No due reminder deliveries");
    return;
  }

  console.log(`[Worker] Found ${due.length} due reminder deliveries`);

  // Agrupa por groupKey = publisherId|meetingWeekId|reminderType. Sólo se agrupan
  // los deliveries realmente vencidos en este tick (los que vinieron en `due`).
  const groups = groupDeliveries(due);
  console.log(`[Worker] Grouped into ${groups.length} person/week/bucket group(s)`);

  // Anti-baneo: tope de mensajes por tick. Si al generar una semana completa se
  // programan muchos avisos a la vez, NO se envían todos de golpe: se mandan
  // hasta `maxSendsPerRun` mensajes y el resto queda PENDING para el siguiente
  // tick (cada 10 min). Cada mensaje enviado (individual o agrupado) suma 1.
  let sentThisRun = 0;
  const maxSendsPerRun = sendConfig.maxSendsPerRun;

  for (const group of groups) {
    if (maxSendsPerRun > 0 && sentThisRun >= maxSendsPerRun) {
      console.log(`[Worker] Tope de envíos por tick alcanzado (${maxSendsPerRun}); el resto se enviará en el próximo tick.`);
      break;
    }
    const groupId = group[0].id;
    try {
      // 2a. Claim atómico del grupo. Sólo seguimos con los deliveries reclamados.
      const claimedIds = await claimGroup(group);
      if (claimedIds.length === 0) continue;

      // Refrescamos el estado actual (con includes) de lo reclamado y validamos.
      const claimedSet = new Set(claimedIds);
      const fresh = await prisma.reminderDelivery.findMany({
        where: { id: { in: claimedIds } },
        include: DELIVERY_INCLUDE,
      });
      // Preservamos el orden de aparición original del grupo.
      const orderedFresh = group.filter((d) => claimedSet.has(d.id)).map((d) => fresh.find((f) => f.id === d.id)!);

      const sendable: FreshDelivery[] = [];
      for (const f of orderedFresh) {
        if (await validateFresh(f)) sendable.push(f);
      }
      if (sendable.length === 0) continue;

      if (sendable[0].reminderType === "INITIAL_NOTICE" && !sendable.some((d) => typeof d.customMessage === "string" && d.customMessage.trim().length > 0)) {
        // Aviso inicial MENSUAL: un solo mensaje por persona con todo el mes.
        await performMonthlyInitialSend(sendable, sendConfig);
        sentThisRun += 1;
      } else if (sendable.length >= 2 && isGroupCombinable(sendable)) {
        // 2b–f. Un solo mensaje agrupado para todo el grupo (cuenta como 1 envío).
        await performGroupedSend(sendable, sendConfig);
        sentThisRun += 1;
      } else {
        // Grupo de 1, aviso especial o con customMessage: envío individual
        // (comportamiento original, plantilla editable + customMessage). Se
        // respeta el tope: cada mensaje individual cuenta y corta al llegar.
        for (const f of sendable) {
          await performSingleSend(f, sendConfig);
          sentThisRun += 1;
          if (maxSendsPerRun > 0 && sentThisRun >= maxSendsPerRun) break;
        }
      }
    } catch (err) {
      console.error(`[Worker] Error on reminder group ${groupId}:`, err);
      // Marca como FAILED todos los deliveries del grupo (resultado consistente).
      for (const d of group) {
        await prisma.reminderDelivery.update({
          where: { id: d.id },
          data: {
            status: "FAILED",
            errorMessage: String(err),
            attemptCount: { increment: 1 },
            nextRetryAt: new Date(Date.now() + 10 * 60 * 1000),
          },
        }).catch(() => undefined);
        await event("REMINDER_FAILED", "ReminderDelivery", d.id, { error: String(err) });
      }
    }
  }
}
