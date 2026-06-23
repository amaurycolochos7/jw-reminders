import { Client, LocalAuth } from "whatsapp-web.js";
import qrcode from "qrcode-terminal";
import { prisma, WhatsappSessionStatus } from "@jw-reminders/database";

const dataPath = process.env.WHATSAPP_SESSION_PATH || ".wwebjs_auth";

export let status: WhatsappSessionStatus = "STARTING";

export const client = new Client({
  authStrategy: new LocalAuth({ dataPath }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  },
});

async function logStatus(newStatus: WhatsappSessionStatus, message?: string) {
  status = newStatus;
  console.log(`[WhatsApp] ${newStatus}${message ? `: ${message}` : ""}`);
  await prisma.jwWhatsappSessionLog.create({ data: { status: newStatus, message } });
}

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
  logStatus("QR_REQUIRED");
});

client.on("authenticated", () => logStatus("AUTHENTICATED"));
client.on("ready", () => logStatus("READY"));
client.on("disconnected", (reason) => logStatus("DISCONNECTED", reason));
client.on("auth_failure", (msg) => logStatus("FAILED", msg));

export async function initWhatsApp() {
  await logStatus("STARTING");
  await client.initialize();
}
