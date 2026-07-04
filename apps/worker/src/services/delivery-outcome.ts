import type { SendResult } from "@jw-reminders/shared/whatsapp";

/**
 * Lógica PURA (sin DB) que decide el estado final de un delivery a partir del
 * resultado del envío. Es la fuente de verdad anti-duplicados y se testea de
 * forma determinista. `finalizeDeliveryStatus` la consume.
 */
export type FinalStatus = "SENT" | "PENDING" | "UNCERTAIN" | "FAILED" | "DEAD";

export interface DeliveryFinalPlan {
  status: FinalStatus;
  /** Cuánto incrementa attemptCount (NOT_READY/UNCERTAIN no cuentan intento). */
  attemptCountDelta: 0 | 1;
  /** ¿Debe programarse un nextRetryAt? (solo fallo no terminal). */
  scheduleRetry: boolean;
  /** ¿Debe registrarse JwMessageLog/NotificationLog? (NOT_READY no: nada pasó). */
  recordAudit: boolean;
  /** Evento de automatización a emitir. */
  event: "REMINDER_SENT" | "REMINDER_DEFERRED" | "REMINDER_UNCERTAIN" | "REMINDER_FAILED";
  /** Marca terminal (DEAD). */
  terminal: boolean;
}

export function planFinalState(
  delivery: { attemptCount: number; maxAttempts: number },
  result: SendResult,
): DeliveryFinalPlan {
  // Éxito real o deduplicado ⇒ entregado.
  if (result.success) {
    return { status: "SENT", attemptCountDelta: 1, scheduleRetry: false, recordAudit: true, event: "REMINDER_SENT", terminal: false };
  }
  switch (result.outcome) {
    case "NOT_READY":
      // Nada se envió; reintento pronto sin contar intento ni registrar fallo.
      return { status: "PENDING", attemptCountDelta: 0, scheduleRetry: false, recordAudit: false, event: "REMINDER_DEFERRED", terminal: false };
    case "UNCERTAIN":
      // Ambiguo: pudo entregarse ⇒ NO reintentar automáticamente (no duplicar).
      return { status: "UNCERTAIN", attemptCountDelta: 0, scheduleRetry: false, recordAudit: true, event: "REMINDER_UNCERTAIN", terminal: false };
    case "REJECTED":
    default: {
      const attemptCount = delivery.attemptCount + 1;
      const terminal = attemptCount >= delivery.maxAttempts;
      return { status: terminal ? "DEAD" : "FAILED", attemptCountDelta: 1, scheduleRetry: !terminal, recordAudit: true, event: "REMINDER_FAILED", terminal };
    }
  }
}

/**
 * Decisión PURA del reaper para una fila SENDING atorada, según el estado del
 * outbox de idempotencia. Garantiza que NO se reintente algo que ya se envió.
 */
export type ReaperTarget = "SENT" | "UNCERTAIN" | "PENDING";

export function planReaperTarget(outboxStatus: string | null | undefined): ReaperTarget {
  if (outboxStatus === "SENT") return "SENT";
  // Sigue en vuelo o ambiguo ⇒ no reintentar a ciegas.
  if (outboxStatus === "UNCERTAIN" || outboxStatus === "SENDING") return "UNCERTAIN";
  // FAILED (rechazo definitivo) o sin evidencia ⇒ seguro reintentar.
  return "PENDING";
}

/**
 * Fase 6 — Gate de envíos. Decide (lógica PURA) si el worker debe enviar en este
 * tick. La cola SIEMPRE queda intacta cuando no se envía (no se reclama nada, no
 * se consumen intentos).
 *  - Pausa MANUAL (sticky): tiene prioridad; se mantiene aunque WhatsApp esté READY
 *    (el usuario decide reanudar). → "paused_manual".
 *  - Pausa AUTOMÁTICA: WhatsApp no está READY. Se levanta sola al reconectar. →
 *    "whatsapp_not_ready".
 */
export type SendGate = { proceed: boolean; reason: "ok" | "paused_manual" | "whatsapp_not_ready" };

export function evaluateSendGate(input: { manualPause: boolean; whatsappReady: boolean }): SendGate {
  if (input.manualPause) return { proceed: false, reason: "paused_manual" };
  if (!input.whatsappReady) return { proceed: false, reason: "whatsapp_not_ready" };
  return { proceed: true, reason: "ok" };
}
