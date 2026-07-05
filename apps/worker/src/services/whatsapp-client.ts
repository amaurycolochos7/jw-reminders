import { WHATSAPP_SEND_HTTP_TIMEOUT_MS, type SendResult, type SendOutcome } from "@jw-reminders/shared/whatsapp";

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || "http://localhost:3010";

// Timeout alto porque /send-with-typing-and-ack incluye typing (hasta 18s) + ACK wait (hasta 60s).
const TYPING_SEND_TIMEOUT_MS = 100_000; // 100s

/**
 * Envía un mensaje al servicio WhatsApp usando /send-with-typing-and-ack:
 *  - Activa estado "escribiendo" por duración variable (obligatorio).
 *  - Espera ACK real antes de reportar éxito.
 *  - Si ACK=-1 → REJECTED.
 *  - Si timeout sin ACK → UNCERTAIN.
 *  - Si typing falla → fallo (worker debe pausar cola).
 */
export async function sendWhatsappMessage(
  phone: string,
  message: string,
  idempotencyKey?: string,
): Promise<SendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TYPING_SEND_TIMEOUT_MS);
  try {
    const res = await fetch(`${WHATSAPP_API_URL}/send-with-typing-and-ack`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.WHATSAPP_INTERNAL_TOKEN ? { "x-internal-token": process.env.WHATSAPP_INTERNAL_TOKEN } : {}),
      },
      body: JSON.stringify({ phone, message, idempotencyKey, waitForAckSeconds: 60 }),
      signal: controller.signal,
    });
    const data: any = await res.json().catch(() => ({}));

    if (res.ok && data?.success) {
      const outcome: SendOutcome = data.outcome === "DEDUPED" ? "DEDUPED" : "SENT";
      return { success: true, outcome, messageId: data.messageId, deduped: !!data.deduped };
    }

    // Mapear outcomes del nuevo endpoint a SendOutcome del worker
    if (data && typeof data.outcome === "string") {
      const outcome: SendOutcome =
        data.outcome === "TYPING_FAILED" ? "NOT_READY" :
        data.outcome === "REJECTED" ? "REJECTED" :
        data.outcome === "NOT_READY" ? "NOT_READY" :
        "UNCERTAIN";
      return { success: false, outcome, error: data.error };
    }

    return { success: false, outcome: "UNCERTAIN", error: data?.error || `HTTP ${res.status}` };
  } catch (err: any) {
    const error = err?.name === "AbortError"
      ? `Timeout (${TYPING_SEND_TIMEOUT_MS}ms) esperando typing+send+ACK`
      : String(err);
    return { success: false, outcome: "UNCERTAIN", error };
  } finally {
    clearTimeout(timer);
  }
}
