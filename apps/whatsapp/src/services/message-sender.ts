import { client, status } from "../client/whatsapp.js";

/**
 * Normaliza un número a formato internacional para resolver el WID de WhatsApp.
 * - 10 dígitos (nacional MX) -> 52 + número.
 * - 13 dígitos 521XXXXXXXXXX (formato móvil MX antiguo) -> 52 + últimos 10
 *   (WhatsApp resuelve el WID real; el "1" extra suele sobrar).
 * - 12 dígitos 52XXXXXXXXXX -> tal cual.
 * - Otro -> se deja como viene (números internacionales).
 */
export function toWhatsappNumber(raw: string): string {
  const d = String(raw).replace(/\D/g, "");
  if (d.length === 10) return "52" + d;
  if (d.length === 13 && d.startsWith("521")) return "52" + d.slice(3);
  return d;
}

export async function sendMessage(phone: string, message: string) {
  const number = toWhatsappNumber(phone);
  if (!/^\d{10,15}$/.test(number)) {
    return { success: false, error: "Formato de teléfono inválido. Use 10-15 dígitos." };
  }
  if (status !== "READY") {
    return { success: false, error: `Cliente no listo. Estado actual: ${status}` };
  }
  try {
    // Resolver el ID real de WhatsApp (WID). Esto corrige el caso México
    // (521 vs 52) y evita "falsos envíos": si el número no está en WhatsApp,
    // getNumberId devuelve null y NO reportamos éxito.
    const numberId = await client.getNumberId(number);
    if (!numberId) {
      console.warn(`[WhatsApp] Número no registrado en WhatsApp: ${number} (origen: ${phone})`);
      return { success: false, error: `El número ${number} no está registrado en WhatsApp.` };
    }
    const chatId = numberId._serialized;
    const result = await client.sendMessage(chatId, message);
    console.log(`[WhatsApp] Enviado a ${chatId} (msgId=${result.id.id})`);
    return { success: true, messageId: result.id.id, chatId };
  } catch (err: any) {
    console.error(`[WhatsApp] Error al enviar a ${number}:`, err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
}
