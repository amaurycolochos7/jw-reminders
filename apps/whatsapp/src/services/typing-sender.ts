/**
 * Envío escalonado con estado "escribiendo" obligatorio.
 *
 * Flujo: getChatById → sendStateTyping → delay variable → clearState → sendMessage → waitForAck
 *
 * ponytail: una sola función hace todo, sin abstracciones extra.
 */
import { client, status as whatsappStatus, waitForAck } from "../client/whatsapp.js";
import { sendMessage, toWhatsappNumber } from "../services/message-sender.js";
import { prisma } from "@jw-reminders/database";

// ── Configuración de typing (como el scrapper que no banea) ─────────────────
const TYPING_MIN_S = Number(process.env.WHATSAPP_TYPING_MIN_SECONDS) || 2;
const TYPING_MAX_S = Number(process.env.WHATSAPP_TYPING_MAX_SECONDS) || 5;
const TYPING_PER_CHAR_MS = Number(process.env.WHATSAPP_TYPING_PER_CHAR_MS) || 15;
const TYPING_JITTER_PERCENT = Number(process.env.WHATSAPP_TYPING_JITTER_PERCENT) || 30;
const REQUIRE_TYPING = process.env.WHATSAPP_REQUIRE_TYPING_BEFORE_SEND === "true";

export interface TypingSendInput {
  phone: string;
  message: string;
  idempotencyKey?: string;
  waitForAckSeconds?: number;
}

export interface TypingSendResult {
  success: boolean;
  outcome: string;
  ack: number | null;
  messageId: string | null;
  typingDurationMs: number;
  chatId: string | null;
  error?: string;
  sentAt?: string;
  ackUpdatedAt?: string;
}

/**
 * Calcula una duración de typing variable según longitud del mensaje.
 * No es fija, no es predecible. Simula escritura humana.
 */
export function generateTypingDurationMs(message: string): number {
  const charMs = message.length * TYPING_PER_CHAR_MS;
  const minMs = TYPING_MIN_S * 1000;
  const maxMs = TYPING_MAX_S * 1000;

  // Base: tiempo proporcional a chars, acotado entre min y max
  let base = Math.max(minMs, Math.min(maxMs, charMs));

  // Jitter: ±TYPING_JITTER_PERCENT%
  const jitterRange = base * (TYPING_JITTER_PERCENT / 100);
  const jitter = (Math.random() * 2 - 1) * jitterRange;
  base = Math.round(Math.max(minMs, Math.min(maxMs, base + jitter)));

  return base;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Flujo completo: typing → send → wait ACK.
 * Nunca marca SENT sin ACK real.
 */
export async function sendWithTypingAndAck(input: TypingSendInput): Promise<TypingSendResult> {
  const { phone, message, idempotencyKey, waitForAckSeconds = 60 } = input;
  const number = toWhatsappNumber(phone);
  let typingDurationMs = 0;
  let chatId: string | null = null;

  // 1. Verificar que WhatsApp esté READY
  if (whatsappStatus !== "READY") {
    return { success: false, outcome: "NOT_READY", ack: null, messageId: null, typingDurationMs: 0, chatId: null, error: `WhatsApp no listo (${whatsappStatus})` };
  }

  // 2. Obtener chat para typing
  try {
    const numberId = await client.getNumberId(number + "@c.us");
    if (!numberId) {
      return { success: false, outcome: "REJECTED", ack: null, messageId: null, typingDurationMs: 0, chatId: null, error: `Número ${number} no registrado en WhatsApp` };
    }
    chatId = numberId._serialized;

    // 3. Activar estado "escribiendo"
    const chat = await client.getChatById(chatId);
    typingDurationMs = generateTypingDurationMs(message);

    try {
      await chat.sendStateTyping();
    } catch (typingErr: any) {
      if (REQUIRE_TYPING) {
        return { success: false, outcome: "TYPING_FAILED", ack: null, messageId: null, typingDurationMs: 0, chatId, error: `sendStateTyping falló: ${typingErr.message}` };
      }
      // Si no es obligatorio, log y continuar
      console.warn(`[WhatsApp] sendStateTyping error (no-fatal): ${typingErr.message}`);
    }

    // 4. Esperar duración de typing
    await delay(typingDurationMs);

    // 5. Limpiar estado de escritura
    try {
      await chat.clearState();
    } catch {
      // No fatal: algunos chats no soportan clearState
    }
  } catch (chatErr: any) {
    // Error obteniendo chat o durante typing
    if (REQUIRE_TYPING) {
      return { success: false, outcome: "TYPING_FAILED", ack: null, messageId: null, typingDurationMs, chatId, error: `Error preparando chat: ${chatErr.message}` };
    }
  }

  // 6. Enviar mensaje (usa el endpoint interno de sendMessage que maneja idempotencia)
  const sendResult = await sendMessage(phone, message, idempotencyKey);

  if (!sendResult.success && sendResult.outcome !== "SENT") {
    return {
      success: false,
      outcome: sendResult.outcome,
      ack: null,
      messageId: sendResult.messageId ?? null,
      typingDurationMs,
      chatId,
      error: sendResult.error,
    };
  }

  if (sendResult.outcome === "DEDUPED") {
    return {
      success: true,
      outcome: "DEDUPED",
      ack: null,
      messageId: sendResult.messageId ?? null,
      typingDurationMs,
      chatId,
    };
  }

  const messageId = sendResult.messageId ?? null;
  if (!messageId) {
    return { success: false, outcome: "UNCERTAIN", ack: null, messageId: null, typingDurationMs, chatId, error: "No messageId received" };
  }

  // 7. Esperar ACK real
  const timeoutMs = Math.min(Math.max(waitForAckSeconds, 10), 120) * 1000;
  const ack = await waitForAck(messageId, timeoutMs);

  // 8. Clasificar resultado
  let outcome: string;
  let success: boolean;

  if (ack === null || ack === 0) {
    outcome = "UNCERTAIN";
    success = false;
  } else if (ack === -1) {
    outcome = "REJECTED";
    success = false;
  } else if (ack === 1) {
    outcome = "SENT_TO_SERVER";
    success = true;
  } else if (ack >= 2) {
    outcome = ack >= 3 ? "READ" : "DELIVERED";
    success = true;
  } else {
    outcome = "UNCERTAIN";
    success = false;
  }

  return {
    success,
    outcome,
    ack,
    messageId,
    typingDurationMs,
    chatId,
    sentAt: new Date().toISOString(),
  };
}
