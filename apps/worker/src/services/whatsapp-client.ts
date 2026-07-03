import { WHATSAPP_SEND_HTTP_TIMEOUT_MS, type SendResult, type SendOutcome } from "@jw-reminders/shared/whatsapp";

const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || "http://localhost:3010";

/**
 * Envía un mensaje al servicio WhatsApp con:
 *  - `idempotencyKey` para deduplicación crash-safe en el servicio (H1).
 *  - Timeout explícito vía AbortController (H3): un cuelgue no bloquea el worker.
 *  - Clasificación de resultado (SendResult.outcome). CLAVE: un error de
 *    transporte (timeout/red) NO se reporta como fallo definitivo, sino como
 *    UNCERTAIN, porque el mensaje pudo haberse entregado. Así el worker NO lo
 *    reintenta a ciegas (que es lo que causaba duplicados).
 */
export async function sendWhatsappMessage(
  phone: string,
  message: string,
  idempotencyKey?: string,
): Promise<SendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WHATSAPP_SEND_HTTP_TIMEOUT_MS);
  try {
    const res = await fetch(`${WHATSAPP_API_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message, idempotencyKey }),
      signal: controller.signal,
    });
    const data: any = await res.json().catch(() => ({}));

    if (res.ok && data?.success) {
      const outcome: SendOutcome = data.outcome === "DEDUPED" ? "DEDUPED" : "SENT";
      return { success: true, outcome, messageId: data.messageId, deduped: !!data.deduped };
    }

    // El servicio devuelve un outcome explícito incluso en no-2xx: respetarlo.
    if (data && typeof data.outcome === "string") {
      return { success: false, outcome: data.outcome as SendOutcome, error: data.error };
    }

    // HTTP no-ok sin outcome legible: ambiguo (no sabemos si entregó).
    return { success: false, outcome: "UNCERTAIN", error: data?.error || `HTTP ${res.status}` };
  } catch (err: any) {
    // Timeout / conexión caída ⇒ AMBIGUO. Pudo haberse entregado ⇒ UNCERTAIN.
    const error = err?.name === "AbortError"
      ? `Timeout (${WHATSAPP_SEND_HTTP_TIMEOUT_MS} ms) al servicio WhatsApp`
      : String(err);
    return { success: false, outcome: "UNCERTAIN", error };
  } finally {
    clearTimeout(timer);
  }
}
