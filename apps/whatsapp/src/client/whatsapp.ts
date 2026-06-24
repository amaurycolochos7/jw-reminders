import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import { prisma, WhatsappSessionStatus } from "@jw-reminders/database";

const dataPath = process.env.WHATSAPP_SESSION_PATH || ".wwebjs_auth";
const INIT_TIMEOUT_MS = 90_000; // 90 seconds max for initialize

export let status: WhatsappSessionStatus = "STARTING";
export let lastQR: string | null = null;
export let connectedNumber: string | null = null;
export let lastConnected: string | null = null;
export let lastDisconnected: string | null = null;
export let lastError: string | null = null;

let currentClient: InstanceType<typeof Client>;

function createClient(): InstanceType<typeof Client> {
  const c = new Client({
    authStrategy: new LocalAuth({ dataPath }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-software-rasterizer",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
        "--disable-accelerated-2d-canvas",
      ],
      timeout: 60000,
    },
  });
  setupListeners(c);
  return c;
}

function setupListeners(c: InstanceType<typeof Client>) {
  c.on("qr", (qr: string) => {
    lastQR = qr;
    lastError = null;
    qrcode.generate(qr, { small: true });
    logStatus("QR_REQUIRED");
  });

  c.on("authenticated", () => {
    lastQR = null;
    lastError = null;
    logStatus("AUTHENTICATED");
  });

  c.on("ready", async () => {
    lastQR = null;
    lastError = null;
    lastConnected = new Date().toISOString();
    try { connectedNumber = c.info?.wid?.user || null; } catch {}
    logStatus("READY");
  });

  c.on("disconnected", (reason: string) => {
    lastDisconnected = new Date().toISOString();
    connectedNumber = null;
    logStatus("DISCONNECTED", reason);
  });

  c.on("auth_failure", (msg: string) => {
    lastError = msg;
    logStatus("FAILED", msg);
  });
}

export const client = (() => {
  currentClient = createClient();
  return currentClient;
})();

// Getter for the current client instance
export function getClient(): InstanceType<typeof Client> {
  return currentClient;
}

async function logStatus(newStatus: WhatsappSessionStatus, message?: string) {
  status = newStatus;
  console.log(`[WhatsApp] ${newStatus}${message ? `: ${message}` : ""}`);
  try {
    await prisma.jwWhatsappSessionLog.create({ data: { status: newStatus, message } });
  } catch (e) { /* DB might not be ready yet */ }
}

/**
 * Initialize with timeout. If initialize hangs, we move to DISCONNECTED
 * rather than staying stuck in STARTING forever.
 */
async function initializeWithTimeout(c: InstanceType<typeof Client>): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Initialize timeout after ${INIT_TIMEOUT_MS / 1000}s`));
    }, INIT_TIMEOUT_MS);

    // If we get qr or ready event, clear timeout - it's working
    const clearOnProgress = () => { clearTimeout(timer); };
    c.once("qr", clearOnProgress);
    c.once("ready", clearOnProgress);
    c.once("authenticated", clearOnProgress);

    c.initialize()
      .then(() => {
        clearTimeout(timer);
        resolve();
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function initWhatsApp() {
  await logStatus("STARTING");
  try {
    await initializeWithTimeout(currentClient);
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error(`[WhatsApp] Init failed: ${msg}`);
    lastError = msg;
    // If timeout or crash, set to DISCONNECTED so UI shows actionable state
    if (status === "STARTING") {
      await logStatus("DISCONNECTED", `Init failed: ${msg}`);
    }
  }
}

export async function restartSession() {
  try {
    await currentClient.destroy();
  } catch (e) {
    console.error("[WhatsApp] Destroy error during restart:", e);
  }
  // Recreate client since wwebjs doesn't support re-initialize after destroy
  currentClient = createClient();
  lastQR = null;
  lastError = null;
  status = "STARTING";
  await logStatus("STARTING", "Restart requested");
  try {
    await initializeWithTimeout(currentClient);
  } catch (err: any) {
    const msg = err?.message || String(err);
    lastError = msg;
    if (status === "STARTING") {
      await logStatus("DISCONNECTED", `Restart failed: ${msg}`);
    }
  }
}

export async function disconnectSession() {
  try {
    await currentClient.logout();
  } catch {
    try { await currentClient.destroy(); } catch {}
  }
  lastQR = null;
  connectedNumber = null;
  lastError = null;
  lastDisconnected = new Date().toISOString();
  status = "DISCONNECTED";
  await logStatus("DISCONNECTED", "Manual disconnect");
  // Recreate client for future use
  currentClient = createClient();
}

export async function generateQR() {
  // If already connected, disconnect first to generate a new QR
  if (status === "READY" || status === "AUTHENTICATED") {
    try { await currentClient.logout(); } catch {}
    try { await currentClient.destroy(); } catch {}
  } else {
    try { await currentClient.destroy(); } catch {}
  }
  // Recreate client
  currentClient = createClient();
  lastQR = null;
  lastError = null;
  status = "STARTING";
  await logStatus("STARTING", "QR generation requested");
  try {
    await initializeWithTimeout(currentClient);
  } catch (err: any) {
    const msg = err?.message || String(err);
    lastError = msg;
    if (status === "STARTING") {
      await logStatus("DISCONNECTED", `QR generation failed: ${msg}`);
    }
  }
}
