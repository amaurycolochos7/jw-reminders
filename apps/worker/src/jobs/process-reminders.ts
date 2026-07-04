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
  formatDateSpanish,
  ASSIGNMENT_TYPE_LABELS,
  groupDeliveries,
  type MessagePart,
} from "@jw-reminders/shared";
import { renderReminderMessage } from "../services/template-renderer.js";
import { sendWhatsappMessage } from "../services/whatsapp-client.js";
import { planFinalState, planReaperTarget } from "../services/delivery-outcome.js";
import {
  buildIdempotencyKey,
  REAPER_STALE_QUEUED_MS,
  REAPER_STALE_SENDING_MS,
  type SendResult,
} from "@jw-reminders/shared/whatsapp";

const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE || 50);

const MESES_ES_LOWER = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

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

  // ── Fase 5 (restricción de fallback): flujo NUEVO sin snapshot NO se envía ──
  // Un delivery del flujo nuevo (tiene batchId o sourceType) DEBE llevar su
  // renderedMessage congelado. Si no lo tiene, es un error de generación: se
  // BLOQUEA (no se renderiza en vivo silenciosamente). El render vivo (fallback)
  // solo queda permitido para datos LEGACY (sin batchId ni sourceType).
  const isNewFlow = !!fresh.batchId || !!fresh.sourceType;
  if (isNewFlow && !fresh.renderedMessage) {
    await markSkipped(fresh.id, "Flujo nuevo sin snapshot (renderedMessage vacío): no se renderiza en el worker");
    return false;
  }

  // ── Deduplicación con NotificationLog (H1) ──
  // Barrera a nivel de DB contra duplicados: si YA existe una notificación SENT
  // para esta (asignación, persona, claveDeNotificación), NO se reenvía. Antes
  // esto solo aplicaba al primer aviso (FIRST_ASSIGNMENT); ahora cubre TAMBIÉN
  // los recordatorios (7/3/1 días), que eran el principal vector de duplicados
  // cuando un envío real se reportaba como fallo y se reintentaba.
  const notif = classifyNotification(fresh.reminderType);
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
    await markSkipped(fresh.id, `Notificación ya enviada (NotificationLog: ${notif.key})`);
    return false;
  }

  return true;
}

/** Registra JwMessageLog + upsert NotificationLog para un delivery enviado. */
async function recordDeliveryAudit(
  fresh: FreshDelivery,
  phone: string,
  message: string,
  result: SendResult,
) {
  const { assignment, publisher, automationPlan } = fresh;
  const notif = classifyNotification(fresh.reminderType);
  const sent = result.success; // SENT o DEDUPED
  const uncertain = result.outcome === "UNCERTAIN";
  const errText = uncertain ? `UNCERTAIN: ${result.error || "resultado ambiguo"}` : (result.error || undefined);

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
      status: sent ? "SENT" : "FAILED",
      errorMessage: errText,
      sentAt: sent ? new Date() : undefined,
    },
  });
  await event("MESSAGE_ATTEMPT_CREATED", "ReminderDelivery", fresh.id, {
    success: sent,
    outcome: result.outcome,
    deduped: !!result.deduped,
    messageId: result.messageId ?? null,
    phone,
    idempotencyKey: fresh.idempotencyKey ?? null,
    attemptCount: fresh.attemptCount + 1,
  });

  // NotificationLog: SENT solo si realmente se envió/dedupeó. UNCERTAIN NO marca
  // SENT (no bloquea una eventual reconciliación/reenvío consciente).
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
      status: sent ? "SENT" : "FAILED",
      sentAt: sent ? new Date() : null,
      whatsappMessageId: result.messageId || null,
      errorMessage: result.error || null,
    },
    update: {
      notificationType: notif.type,
      status: sent ? "SENT" : "FAILED",
      sentAt: sent ? new Date() : null,
      whatsappMessageId: result.messageId || null,
      errorMessage: result.error || null,
    },
  });
}

/**
 * Actualiza el estado final del delivery según el OUTCOME del envío (H1/H3/H5):
 *  - SENT/DEDUPED → SENT.
 *  - NOT_READY   → vuelve a PENDING (nada enviado; reintento pronto, sin contar intento).
 *  - UNCERTAIN   → UNCERTAIN (ambiguo; NO auto-retry para no duplicar).
 *  - REJECTED    → FAILED (o DEAD si agota intentos).
 * Emite eventos enriquecidos con prevStatus/newStatus/reason/outcome/idempotencyKey.
 */
async function finalizeDeliveryStatus(fresh: FreshDelivery, result: SendResult) {
  const idempotencyKey = fresh.idempotencyKey ?? null;
  const plan = planFinalState({ attemptCount: fresh.attemptCount, maxAttempts: fresh.maxAttempts }, result);
  const attemptCount = fresh.attemptCount + plan.attemptCountDelta;

  if (plan.status === "SENT") {
    await prisma.reminderDelivery.update({
      where: { id: fresh.id },
      data: { status: "SENT", attemptCount, sentAt: new Date(), errorMessage: null, nextRetryAt: null, uncertainAt: null },
    });
    await event("REMINDER_SENT", "ReminderDelivery", fresh.id, {
      prevStatus: "SENDING", newStatus: "SENT", outcome: result.outcome,
      deduped: !!result.deduped, messageId: result.messageId ?? null, attemptCount, idempotencyKey,
    });
    return;
  }

  if (plan.status === "PENDING") { // NOT_READY: nada enviado, reintento pronto.
    await prisma.reminderDelivery.update({
      where: { id: fresh.id },
      data: { status: "PENDING", nextRetryAt: null, errorMessage: result.error || "Cliente WhatsApp no listo" },
    });
    await event("REMINDER_DEFERRED", "ReminderDelivery", fresh.id, {
      prevStatus: "SENDING", newStatus: "PENDING", reason: "client_not_ready", error: result.error ?? null, idempotencyKey,
    });
    return;
  }

  if (plan.status === "UNCERTAIN") { // Ambiguo: no reintentar automáticamente.
    await prisma.reminderDelivery.update({
      where: { id: fresh.id },
      data: { status: "UNCERTAIN", uncertainAt: new Date(), errorMessage: result.error || "Resultado de envío ambiguo" },
    });
    await event("REMINDER_UNCERTAIN", "ReminderDelivery", fresh.id, {
      prevStatus: "SENDING", newStatus: "UNCERTAIN", reason: "ambiguous_send", error: result.error ?? null, idempotencyKey,
    });
    return;
  }

  // FAILED o DEAD (REJECTED).
  const nextRetryAt = plan.scheduleRetry ? new Date(Date.now() + retryDelayMs(attemptCount + 1)) : null;
  await prisma.reminderDelivery.update({
    where: { id: fresh.id },
    data: {
      status: plan.status,
      attemptCount,
      errorMessage: result.error || "Unknown WhatsApp error",
      nextRetryAt,
      deadAt: plan.terminal ? new Date() : null,
    },
  });
  await event("REMINDER_FAILED", "ReminderDelivery", fresh.id, {
    prevStatus: "SENDING", newStatus: plan.status,
    outcome: result.outcome, attemptCount, terminal: plan.terminal, error: result.error ?? null, idempotencyKey,
  });
  if (plan.terminal) {
    await event("REMINDER_DEAD", "ReminderDelivery", fresh.id, { attemptCount, idempotencyKey });
  } else {
    await event("REMINDER_RETRY_SCHEDULED", "ReminderDelivery", fresh.id, { attemptCount, nextRetryAt, idempotencyKey });
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

  // Fase 5: si hay snapshot congelado, el worker lo envía TAL CUAL y NO renderiza.
  // customMessage (mecanismo legacy) mantiene prioridad si existe.
  let message: string;
  if (fresh.renderedMessage) {
    message = resolveOutboundMessage(fresh.customMessage, fresh.renderedMessage);
  } else {
    const templateMessage = await renderReminderMessage({ ...fresh, reminderDay: fresh.reminderType });
    message = resolveOutboundMessage(fresh.customMessage, templateMessage);
  }
  // H1: clave idempotente estable por (entrega + teléfono + contenido).
  const idempotencyKey = buildIdempotencyKey({ deliveryIds: [fresh.id], phone, message });
  fresh.idempotencyKey = idempotencyKey;

  await prisma.reminderDelivery.update({
    where: { id: fresh.id },
    data: { status: "SENDING", lastAttemptAt: new Date(), idempotencyKey },
  });
  await event("REMINDER_SENDING", "ReminderDelivery", fresh.id, { prevStatus: "QUEUED", newStatus: "SENDING", reminderType: fresh.reminderType, phone, idempotencyKey });

  const result = await sendWhatsappMessage(phone, message, idempotencyKey);

  if (result.outcome !== "NOT_READY") {
    await recordDeliveryAudit(fresh, phone, message, result);
  }
  await finalizeDeliveryStatus(fresh, result);
  // Anti-baneo: jitter solo si hubo intento físico (NOT_READY no consume envío).
  if (result.outcome !== "NOT_READY") {
    await delay(randomSendDelayMs(sendConfig.delayMinMs, sendConfig.delayMaxMs));
  }
}

/** Nombre visible de un publicador (displayName con respaldo en fullName). */
function personDisplayName(p?: { displayName: string | null; fullName: string } | null): string {
  return p ? (p.displayName || p.fullName) : "";
}

/**
 * Mapea un delivery a la parte "rica" que consumen los generadores de mensaje
 * (número de punto, sección, título, duración, rol y contraparte). Es la ÚNICA
 * fuente de datos por parte, compartida por el aviso inicial y los recordatorios.
 */
function deliveryToMessagePart(d: FreshDelivery): MessagePart {
  const a = d.assignment!;
  return {
    // Orden del programa; respaldo en el número interno de la asignación.
    sortOrder: a.programItem?.sortOrder ?? a.assignmentNumber,
    // Número real del punto en el programa (WOL). Sin él, no se muestra "Punto N".
    pointNumber: a.programItem?.itemNumber ?? null,
    sectionLabel: ASSIGNMENT_TYPE_LABELS[a.assignmentType] || a.assignmentType,
    title: a.title,
    durationMinutes: a.durationMinutes,
    isApplyYourself: a.section === "APPLY_YOURSELF",
    recipientRole: d.recipientRole,
    companionName: personDisplayName(a.companion) || null,
    assignedName: personDisplayName(a.assigned) || null,
  };
}

/**
 * Envío AGRUPADO: una persona con una o varias partes en la misma reunión +
 * mismo bucket recibe UN SOLO mensaje (recordatorio 7/3/1 días). `deliveries` ya
 * están validados y comparten publisher/semana/reminderType. Todos comparten el
 * mismo providerMessageId y el mismo resultado (éxito/fallo).
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

  const parts = deliveries.map(deliveryToMessagePart);

  // Fase 5: si el grupo tiene snapshot congelado (todas las hermanas comparten el
  // mismo texto), el worker lo envía TAL CUAL. Solo si no hay snapshot (legacy)
  // cae al render en vivo.
  const frozen = deliveries.find((d) => d.renderedMessage)?.renderedMessage ?? null;
  const message = frozen ?? buildGroupedPersonMessage({
    personName: personDisplayName(publisher),
    meetingDateText: formatDateSpanish(meetingWeek.meetingDate),
    meetingTimeText: meetingWeek.meetingTime,
    parts,
    showTime: false,
    showDuration: false,
  });

  // H1: UNA sola clave idempotente para el grupo (un único mensaje físico). El
  // servicio WhatsApp deduplica por esta clave, así que aunque el grupo se
  // reintente tras un falso negativo, NO se reenvía N veces.
  const idempotencyKey = buildIdempotencyKey({ deliveryIds: deliveries.map((d) => d.id), phone, message });
  for (const d of deliveries) d.idempotencyKey = idempotencyKey;

  await prisma.reminderDelivery.updateMany({
    where: { id: { in: deliveries.map((d) => d.id) } },
    data: { status: "SENDING", lastAttemptAt: new Date(), idempotencyKey },
  });
  for (const d of deliveries) {
    await event("REMINDER_SENDING", "ReminderDelivery", d.id, { prevStatus: "QUEUED", newStatus: "SENDING", reminderType: d.reminderType, grouped: deliveries.length, phone, idempotencyKey });
  }

  const result = await sendWhatsappMessage(phone, message, idempotencyKey);

  // Un JwMessageLog por delivery apuntando al MISMO providerMessageId: conserva
  // la trazabilidad por asignación (reminderDeliveryId/assignmentId) sin perder el
  // vínculo de que fue un único mensaje físico. NotificationLog por asignación.
  if (result.outcome !== "NOT_READY") {
    for (const d of deliveries) {
      await recordDeliveryAudit(d, phone, message, result);
    }
  }
  for (const d of deliveries) {
    await finalizeDeliveryStatus(d, result);
  }

  // Anti-baneo: jitter solo si hubo intento físico.
  if (result.outcome !== "NOT_READY") {
    await delay(randomSendDelayMs(sendConfig.delayMinMs, sendConfig.delayMaxMs));
  }
}

/** Nombre del mes en minúscula (p. ej. "julio") para el aviso inicial. */
function monthNameFor(fresh: FreshDelivery): string {
  const d = fresh.assignment!.meetingWeek.meetingDate;
  const local = fresh.assignment!.meetingWeek.meetingDateLocal;
  // Preferimos la fecha local ("YYYY-MM-DD") para evitar corrimientos por zona horaria.
  const monthIndex = local ? Number(local.slice(5, 7)) - 1 : d.getUTCMonth();
  return MESES_ES_LOWER[monthIndex] ?? MESES_ES_LOWER[d.getUTCMonth()];
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
      ...deliveryToMessagePart(d),
      meetingDateText: formatDateSpanish(w.meetingDate),
      sortDate: w.meetingDateLocal || w.meetingDate.toISOString().slice(0, 10),
    };
  });

  const message = deliveries.find((d) => d.renderedMessage)?.renderedMessage ?? buildMonthlyInitialMessage({
    personName: personDisplayName(publisher),
    monthName: monthNameFor(first),
    items,
    showDuration: false,
  });

  // H1: una sola clave idempotente para el aviso mensual (un único mensaje).
  const idempotencyKey = buildIdempotencyKey({ deliveryIds: deliveries.map((d) => d.id), phone, message });
  for (const d of deliveries) d.idempotencyKey = idempotencyKey;

  await prisma.reminderDelivery.updateMany({
    where: { id: { in: deliveries.map((d) => d.id) } },
    data: { status: "SENDING", lastAttemptAt: new Date(), idempotencyKey },
  });
  for (const d of deliveries) {
    await event("REMINDER_SENDING", "ReminderDelivery", d.id, { prevStatus: "QUEUED", newStatus: "SENDING", reminderType: d.reminderType, monthly: deliveries.length, phone, idempotencyKey });
  }

  const result = await sendWhatsappMessage(phone, message, idempotencyKey);
  if (result.outcome !== "NOT_READY") {
    for (const d of deliveries) await recordDeliveryAudit(d, phone, message, result);
  }
  for (const d of deliveries) await finalizeDeliveryStatus(d, result);

  if (result.outcome !== "NOT_READY") {
    await delay(randomSendDelayMs(sendConfig.delayMinMs, sendConfig.delayMaxMs));
  }
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

/** ¿El delivery tiene un mensaje personalizado (override) no vacío? */
function hasCustom(d: FreshDelivery): boolean {
  return typeof d.customMessage === "string" && d.customMessage.trim().length > 0;
}

/**
 * ¿El grupo debe renderizarse con el generador rico y uniforme
 * (buildGroupedPersonMessage)? Aplica a recordatorios normales (una o varias
 * partes). Se excluyen los avisos especiales (cambio/cancelación) y cualquier
 * delivery con customMessage, que conservan su plantilla editable individual.
 */
function isRichReminderGroup(group: FreshDelivery[]): boolean {
  if (group.length < 1) return false;
  if (isSpecialNotice(group[0].reminderType)) return false;
  if (group.some(hasCustom)) return false;
  return true;
}

/**
 * H2 — Reaper / reconciliación de entregas atoradas en estados EN VUELO.
 * El worker normal solo re-escanea PENDING/FAILED; si el proceso murió entre el
 * claim y el estado final, quedaban filas QUEUED/SENDING atoradas para siempre.
 * Aquí se rescatan de forma SEGURA (sin duplicar) usando el outbox como evidencia:
 *  - QUEUED viejo  → nada se envió aún → volver a PENDING.
 *  - SENDING viejo → consultar WhatsappOutbox por idempotencyKey:
 *      · SENT       → marcar SENT (el mensaje sí salió).
 *      · UNCERTAIN  → marcar UNCERTAIN (ambiguo; decisión humana).
 *      · SENDING    → seguía en vuelo pero atorado → UNCERTAIN.
 *      · FAILED / sin evidencia → PENDING (seguro reintentar; nada salió).
 */
export async function reconcileStuckDeliveries(now: Date = new Date()) {
  try {
    await runReconcile(now);
  } catch (err: any) {
    // Tolerancia a la carrera de arranque: el worker puede iniciar ANTES de que
    // el contenedor API aplique `prisma migrate deploy`. Si aún falta la columna
    // idempotencyKey (P2022), NO es un error real: el próximo tick (ya migrado)
    // reconciliará. Evita ruido de stack traces alarmantes en el primer deploy.
    if (err?.code === "P2022") {
      console.warn("[Worker] Reconciliación pospuesta: el esquema aún se está migrando (se reintentará en el próximo tick).");
      return;
    }
    throw err;
  }
}

async function runReconcile(now: Date) {
  const queuedCutoff = new Date(now.getTime() - REAPER_STALE_QUEUED_MS);
  const staleQueued = await prisma.reminderDelivery.findMany({
    where: { status: "QUEUED", updatedAt: { lt: queuedCutoff } },
    take: 500,
    select: { id: true },
  });
  for (const d of staleQueued) {
    await prisma.reminderDelivery.update({ where: { id: d.id }, data: { status: "PENDING" } });
    await event("REMINDER_REAPED", "ReminderDelivery", d.id, { prevStatus: "QUEUED", newStatus: "PENDING", reason: "stale_queued" });
  }

  const sendingCutoff = new Date(now.getTime() - REAPER_STALE_SENDING_MS);
  const staleSending = await prisma.reminderDelivery.findMany({
    where: { status: "SENDING", updatedAt: { lt: sendingCutoff } },
    take: 500,
    select: { id: true, idempotencyKey: true },
  });
  for (const d of staleSending) {
    const outbox = d.idempotencyKey
      ? await prisma.whatsappOutbox.findUnique({ where: { idempotencyKey: d.idempotencyKey } })
      : null;
    const target = planReaperTarget(outbox?.status);

    if (target === "SENT") {
      await prisma.reminderDelivery.update({
        where: { id: d.id },
        data: { status: "SENT", sentAt: outbox?.sentAt ?? new Date(), errorMessage: null },
      });
      await event("REMINDER_REAPED", "ReminderDelivery", d.id, { prevStatus: "SENDING", newStatus: "SENT", reason: "outbox_sent", idempotencyKey: d.idempotencyKey });
    } else if (target === "UNCERTAIN") {
      await prisma.reminderDelivery.update({
        where: { id: d.id },
        data: { status: "UNCERTAIN", uncertainAt: new Date(), errorMessage: outbox?.error || "Reconciliación: envío ambiguo" },
      });
      await event("REMINDER_REAPED", "ReminderDelivery", d.id, {
        prevStatus: "SENDING", newStatus: "UNCERTAIN",
        reason: outbox?.status === "SENDING" ? "outbox_stuck_sending" : "outbox_uncertain", idempotencyKey: d.idempotencyKey,
      });
    } else {
      // FAILED o sin outbox: no hay evidencia de envío físico → seguro reintentar.
      await prisma.reminderDelivery.update({
        where: { id: d.id },
        data: { status: "PENDING", nextRetryAt: null },
      });
      await event("REMINDER_REAPED", "ReminderDelivery", d.id, {
        prevStatus: "SENDING", newStatus: "PENDING",
        reason: outbox ? "outbox_failed" : "no_outbox_evidence", idempotencyKey: d.idempotencyKey ?? null,
      });
    }
  }

  if (staleQueued.length || staleSending.length) {
    console.log(`[Worker] Reaper: ${staleQueued.length} QUEUED y ${staleSending.length} SENDING reconciliados.`);
  }
}

// H5 — Serialización del cron: si un tick anterior sigue corriendo (envíos con
// jitter pueden superar los 10 min), NO se arranca otro en paralelo.
let isRunning = false;

export async function processReminders() {
  if (isRunning) {
    console.log("[Worker] Tick anterior aún en curso; se omite este tick para no solapar.");
    return;
  }
  isRunning = true;
  try {
    await runProcessReminders();
  } finally {
    isRunning = false;
  }
}

async function runProcessReminders() {
  const now = new Date();
  const sendConfig = await getSendConfig();

  // H2: primero rescatar entregas atoradas en vuelo (reconciliación segura).
  await reconcileStuckDeliveries(now);

  const due = await prisma.reminderDelivery.findMany({
    where: {
      OR: [
        { status: "PENDING", scheduledAt: { lte: now } },
        // READY: snapshot aprobado y listo para enviar (mismo trato que PENDING).
        { status: "READY", scheduledAt: { lte: now } },
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

      if (sendable[0].reminderType === "INITIAL_NOTICE" && !sendable.some(hasCustom)) {
        // Aviso inicial MENSUAL: un solo mensaje por persona con todo el mes.
        await performMonthlyInitialSend(sendable, sendConfig);
        sentThisRun += 1;
      } else if (isRichReminderGroup(sendable)) {
        // Recordatorio 7/3/1 días: SIEMPRE un mensaje rico y uniforme por persona
        // (una o varias partes), con la misma estructura que el aviso inicial.
        await performGroupedSend(sendable, sendConfig);
        sentThisRun += 1;
      } else {
        // Aviso especial (cambio/cancelación) o delivery con customMessage:
        // envío individual con plantilla editable + customMessage. Respeta el tope.
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
