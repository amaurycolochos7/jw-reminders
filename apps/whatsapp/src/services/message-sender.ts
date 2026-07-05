import { client, status } from "../client/whatsapp.js";
import { prisma } from "@jw-reminders/database";
import {
  contentHash,
  WHATSAPP_INFLIGHT_TIMEOUT_MS,
  WHATSAPP_DEDUP_WINDOW_MS,
  type SendResult,
} from "@jw-reminders/shared/whatsapp";

/**
 * Normaliza un número a formato internacional para resolver el WID de WhatsApp.
 *
 * Regla México (código 52): WhatsApp requiere formato 521XXXXXXXXXX (13 dígitos).
 * Regla México (código 52): WhatsApp usa formato 52XXXXXXXXXX (12 dígitos).
 * El prefijo "1" después del 52 es legacy y causa problemas de detección.
 * - 10 dígitos (nacional MX) -> 52 + número.
 * - 13 dígitos 521XXXXXXXXXX -> quitar el 1: 52 + últimos 10.
 * - 12 dígitos 52XXXXXXXXXX -> tal cual.
 * - Otro país / longitud -> se deja como viene.
 */
export function toWhatsappNumber(raw: string): string {
  const d = String(raw).replace(/\D/g, "");
  // 10 dígitos nacionales MX → 52 + número (SIN el 1)
  if (d.length === 10) return "52" + d;
  // 13 dígitos con 521 → quitar el 1 (formato legacy → moderno)
  if (d.length === 13 && d.startsWith("521")) return "52" + d.slice(3);
  // 12 dígitos con 52 → ya está correcto
  if (d.length === 12 && d.startsWith("52")) return d;
  // Cualquier otro formato internacional → dejar tal cual
  return d;
}

/** Enmascara un teléfono para logs (no exponer números completos). */
function maskPhone(raw: string): string {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length < 4) return "***";
  return `${d.slice(0, 2)}****${d.slice(-2)}`;
}

/**
 * Envío IDEMPOTENTE de un mensaje de WhatsApp (H1/H3).
 *
 * Garantías:
 *  - Si `idempotencyKey` ya está registrada como SENT en el outbox, NO se
 *    reenvía: se devuelve el messageId previo (outcome=DEDUPED).
 *  - Guarda secundaria: si el MISMO contenido se envió al MISMO teléfono dentro
 *    de la ventana anti-duplicado, tampoco se reenvía (outcome=DEDUPED).
 *  - Se reserva la clave en estado SENDING ANTES de llamar a WhatsApp, de modo
 *    que un crash/timeout del worker no provoque un reenvío (el reintento verá
 *    SENT y deduplicará).
 *  - Una excepción tras encolar el mensaje NO se reporta como fallo definitivo:
 *    se marca UNCERTAIN (pudo haberse entregado) para no duplicar.
 */
export async function sendMessage(
  phone: string,
  message: string,
  idempotencyKey?: string,
): Promise<SendResult> {
  const number = toWhatsappNumber(phone);
  if (!/^\d{10,15}$/.test(number)) {
    return { success: false, outcome: "REJECTED", error: "Formato de teléfono inválido. Use 10-15 dígitos." };
  }

  const cHash = contentHash(message);
  const key = idempotencyKey && idempotencyKey.trim().length > 0
    ? idempotencyKey.trim()
    : `adhoc:${cHash}:${number}`;

  // 1) Idempotencia por clave: ¿ya se envió (o está en vuelo)?
  try {
    const existing = await prisma.whatsappOutbox.findUnique({ where: { idempotencyKey: key } });
    if (existing) {
      if (existing.status === "SENT") {
        return { success: true, outcome: "DEDUPED", deduped: true, messageId: existing.providerMessageId ?? undefined };
      }
      if (existing.status === "SENDING" && Date.now() - existing.updatedAt.getTime() < WHATSAPP_INFLIGHT_TIMEOUT_MS) {
        // Otro envío con la misma clave está en vuelo: resultado incierto, no duplicar.
        return { success: false, outcome: "UNCERTAIN", error: "Envío en vuelo con la misma clave idempotente" };
      }
    }

    // 2) Guarda secundaria: mismo contenido + mismo teléfono enviado hace poco.
    const recent = await prisma.whatsappOutbox.findFirst({
      where: {
        phone: number,
        contentHash: cHash,
        status: "SENT",
        sentAt: { gte: new Date(Date.now() - WHATSAPP_DEDUP_WINDOW_MS) },
      },
      orderBy: { sentAt: "desc" },
    });
    if (recent) {
      return { success: true, outcome: "DEDUPED", deduped: true, messageId: recent.providerMessageId ?? undefined };
    }
  } catch (e) {
    // Si la DB no está disponible para la comprobación de idempotencia, es más
    // seguro NO enviar (evita duplicar sin poder deduplicar) y reintentar luego.
    return { success: false, outcome: "NOT_READY", error: `Idempotencia no verificable: ${String(e)}` };
  }

  // 3) Cliente no listo → nada enviado, reintentable.
  if (status !== "READY") {
    return { success: false, outcome: "NOT_READY", error: `Cliente no listo. Estado actual: ${status}` };
  }

  // 4) Reservar la clave (SENDING) ANTES de enviar (crash-safe).
  try {
    await prisma.whatsappOutbox.upsert({
      where: { idempotencyKey: key },
      create: { idempotencyKey: key, phone: number, contentHash: cHash, status: "SENDING", attempts: 1 },
      update: { status: "SENDING", contentHash: cHash, phone: number, attempts: { increment: 1 }, error: null },
    });
  } catch (e) {
    return { success: false, outcome: "NOT_READY", error: `No se pudo reservar idempotencia: ${String(e)}` };
  }

  // 5) Resolver WID y enviar.
  try {
    const numberId = await client.getNumberId(number);
    if (!numberId) {
      await prisma.whatsappOutbox.update({
        where: { idempotencyKey: key },
        data: { status: "FAILED", error: "Número no registrado en WhatsApp" },
      }).catch(() => undefined);
      console.warn(`[WhatsApp] Número no registrado en WhatsApp: ${maskPhone(number)}`);
      return { success: false, outcome: "REJECTED", error: `El número ${number} no está registrado en WhatsApp.` };
    }
    const chatId = numberId._serialized;
    const result = await client.sendMessage(chatId, message);
    const messageId = result?.id?.id;
    await prisma.whatsappOutbox.update({
      where: { idempotencyKey: key },
      data: { status: "SENT", providerMessageId: messageId ?? null, sentAt: new Date(), error: null },
    }).catch(() => undefined);
    console.log(`[WhatsApp] Enviado a ${maskPhone(number)} (msgId=${messageId}) key=${key.slice(0, 12)}…`);
    return { success: true, outcome: "SENT", messageId };
  } catch (err: any) {
    const msg = err?.message || String(err);
    // AMBIGUO: la excepción pudo ocurrir DESPUÉS de encolar el mensaje. No
    // afirmamos que WhatsApp no entregó → UNCERTAIN (no auto-retry para no duplicar).
    await prisma.whatsappOutbox.update({
      where: { idempotencyKey: key },
      data: { status: "UNCERTAIN", error: msg },
    }).catch(() => undefined);
    console.error(`[WhatsApp] Envío INCIERTO a ${maskPhone(number)}:`, msg);
    return { success: false, outcome: "UNCERTAIN", error: msg };
  }
}
