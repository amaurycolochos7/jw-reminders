import { client, status } from "../client/whatsapp.js";

export async function sendMessage(phone: string, message: string) {
  if (!/^\d{10,15}$/.test(phone)) {
    return { success: false, error: "Invalid phone format. Use 10-15 digits." };
  }
  if (status !== "READY") {
    return { success: false, error: `Client not ready. Current status: ${status}` };
  }
  try {
    const chatId = `${phone}@c.us`;
    const result = await client.sendMessage(chatId, message);
    return { success: true, messageId: result.id.id };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
