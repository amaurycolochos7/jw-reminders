import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import { prisma, WhatsappSessionStatus } from "@jw-reminders/database";

const dataPath = process.env.WHATSAPP_SESSION_PATH || ".wwebjs_auth";

export let status: WhatsappSessionStatus = "STARTING";
export let lastQR: string | null = null;
export let connectedNumber: string | null = null;
export let lastConnected: string | null = null;
export let lastDisconnected: string | null = null;

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
  try {
    await prisma.jwWhatsappSessionLog.create({ data: { status: newStatus, message } });
  } catch (e) { /* DB might not be ready yet */ }
}

client.on("qr", (qr: string) => {
  lastQR = qr;
  qrcode.generate(qr, { small: true });
  logStatus("QR_REQUIRED");
});

client.on("authenticated", () => {
  lastQR = null;
  logStatus("AUTHENTICATED");
});

client.on("ready", async () => {
  lastQR = null;
  lastConnected = new Date().toISOString();
  try { connectedNumber = client.info?.wid?.user || null; } catch {}
  logStatus("READY");
});

client.on("disconnected", (reason: string) => {
  lastDisconnected = new Date().toISOString();
  connectedNumber = null;
  logStatus("DISCONNECTED", reason);
});

client.on("auth_failure", (msg: string) => logStatus("FAILED", msg));

export async function initWhatsApp() {
  await logStatus("STARTING");
  await client.initialize();
}

export async function restartSession() {
  await client.destroy();
  lastQR = null;
  status = "STARTING";
  await client.initialize();
}
