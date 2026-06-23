const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || "http://localhost:3010";

export async function sendWhatsappMessage(
  phone: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const res = await fetch(`${WHATSAPP_API_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message }),
    });
    const data = await res.json();
    if (res.ok && data.success) {
      return { success: true, messageId: data.messageId };
    }
    return { success: false, error: data.error || `HTTP ${res.status}` };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
