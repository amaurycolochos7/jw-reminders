/**
 * Helpers de idempotencia y clasificación de resultado de envío de WhatsApp.
 *
 * NODE-ONLY: usa `node:crypto`. Se expone por el subpath "@jw-reminders/shared/whatsapp"
 * (NO por el barrel principal) para que el bundle del cliente web nunca lo importe.
 *
 * Fuente de verdad compartida por el worker (que construye la clave) y el
 * servicio WhatsApp (que deduplica y computa el hash de contenido).
 */
import { createHash } from "node:crypto";

// ── Ventanas de tiempo (ajustables por env sin redeploy de código) ──────────
/** Un outbox en SENDING más reciente que esto se considera "en vuelo". */
export const WHATSAPP_INFLIGHT_TIMEOUT_MS = 2 * 60 * 1000; // 2 min
/** No reenviar el mismo contenido al mismo teléfono dentro de esta ventana. */
export const WHATSAPP_DEDUP_WINDOW_MS = 60 * 60 * 1000; // 1 h
/** Timeout del fetch worker → servicio WhatsApp. */
export const WHATSAPP_SEND_HTTP_TIMEOUT_MS = 45 * 1000; // 45 s
/** Antigüedad para rescatar filas QUEUED atoradas (nada enviado aún). */
export const REAPER_STALE_QUEUED_MS = 5 * 60 * 1000; // 5 min
/** Antigüedad para reconciliar filas SENDING atoradas (envío ambiguo). */
export const REAPER_STALE_SENDING_MS = 10 * 60 * 1000; // 10 min

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Hash estable del contenido del mensaje (para dedup secundaria por contenido). */
export function contentHash(message: string): string {
  return sha256Hex(message);
}

/**
 * Clave idempotente ESTABLE por (conjunto de entregas + teléfono + contenido).
 * - Un reintento del mismo grupo con el mismo contenido produce la MISMA clave
 *   → el servicio deduplica si ya se envió.
 * - Si el contenido cambia (p. ej. mensaje editado), la clave cambia → se envía.
 */
export function buildIdempotencyKey(input: {
  deliveryIds: string[];
  phone: string;
  message: string;
}): string {
  const ids = [...input.deliveryIds].sort().join(",");
  return sha256Hex(`${ids}|${input.phone}|${input.message}`);
}

/**
 * Resultado clasificado de un envío:
 * - SENT: enviado ahora, confirmado por whatsapp-web.js.
 * - DEDUPED: ya se había enviado (idempotencia); NO se reenvió.
 * - REJECTED: rechazo definitivo (número inválido / no registrado). No se envió.
 * - NOT_READY: cliente no listo; nada enviado; reintentable pronto.
 * - UNCERTAIN: resultado ambiguo (timeout/red/excepción tras encolar). Pudo haber
 *   entregado. NO se reintenta automáticamente para no duplicar.
 */
export type SendOutcome = "SENT" | "DEDUPED" | "REJECTED" | "NOT_READY" | "UNCERTAIN";

export interface SendResult {
  success: boolean;
  outcome: SendOutcome;
  messageId?: string;
  error?: string;
  deduped?: boolean;
}
