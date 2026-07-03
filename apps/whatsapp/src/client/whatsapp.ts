import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import { prisma, WhatsappSessionStatus } from "@jw-reminders/database";
import { existsSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const dataPath = process.env.WHATSAPP_SESSION_PATH || ".wwebjs_auth";
const INIT_TIMEOUT_MS = 90_000; // 90 seconds max for initialize

export let status: WhatsappSessionStatus = "STARTING";
export let lastQR: string | null = null;
export let connectedNumber: string | null = null;
export let lastConnected: string | null = null;
export let lastDisconnected: string | null = null;
export let lastError: string | null = null;

let currentClient: InstanceType<typeof Client>;
// ── Reconexión automática ──────────────────────────────────────────────────
// El servicio debe recuperarse solo si WhatsApp se desconecta (blip de red,
// reinicio, etc.). `manualStop` evita reconectar tras un logout manual.
let manualStop = false;
let reconnecting = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Remove Chromium SingletonLock files that prevent launch after unclean shutdown.
 * These get left behind when a container is killed without graceful shutdown.
 */
function cleanChromiumLocks() {
  try {
    // Use find command to locate all Singleton* files (most reliable in Linux containers)
    try {
      execSync(`find ${dataPath} -name "Singleton*" -delete 2>/dev/null`, { stdio: 'ignore' });
      console.log(`[WhatsApp] Cleaned Singleton locks in ${dataPath}`);
    } catch {
      // Fallback: manual recursive search
      removeLockFilesRecursive(dataPath, 0);
    }
  } catch (e) {
    console.error("[WhatsApp] Error cleaning locks:", e);
  }
}

function removeLockFilesRecursive(dir: string, depth: number) {
  if (depth > 6 || !existsSync(dir)) return;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.name.startsWith("Singleton")) {
        try {
          unlinkSync(fullPath);
          console.log(`[WhatsApp] Removed stale lock: ${fullPath}`);
        } catch {}
      } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        removeLockFilesRecursive(fullPath, depth + 1);
      }
    }
  } catch {}
}

function createClient(): InstanceType<typeof Client> {
  // Clean any leftover Chromium lock files before creating a new client
  cleanChromiumLocks();
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
        "--disable-features=LockProfileCookieDatabase",
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
    reconnectAttempts = 0;
    reconnecting = false;
    manualStop = false;
    try { connectedNumber = c.info?.wid?.user || null; } catch {}
    logStatus("READY");
  });

  c.on("disconnected", (reason: string) => {
    lastDisconnected = new Date().toISOString();
    connectedNumber = null;
    logStatus("DISCONNECTED", reason);
    // Recuperación automática (salvo desconexión manual).
    if (!manualStop) scheduleReconnect(`evento disconnected: ${reason}`);
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

/** Backoff exponencial acotado: 5s, 10s, 20s, 40s, 60s (máx). */
function reconnectDelayMs(): number {
  return Math.min(5000 * 2 ** reconnectAttempts, 60000);
}

/**
 * Reconexión automática con backoff. Recrea el cliente (wwebjs no permite
 * re-initialize tras destroy) y reintenta hasta reconectar. Se detiene si hubo
 * una desconexión manual. Idempotente ante llamadas solapadas.
 */
async function scheduleReconnect(reason: string) {
  if (manualStop || reconnecting) return;
  reconnecting = true;
  reconnectAttempts += 1;
  const delay = reconnectDelayMs();
  console.log(`[WhatsApp] Reconexión automática en ${Math.round(delay / 1000)}s (intento ${reconnectAttempts}) — ${reason}`);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(async () => {
    try {
      try { await currentClient.destroy(); } catch { /* ignore */ }
      currentClient = createClient();
      status = "STARTING";
      await logStatus("STARTING", `Auto-reconexión (intento ${reconnectAttempts})`);
      await initializeWithTimeout(currentClient);
      reconnecting = false;
      // Si el intento no dejó una sesión utilizable, reprogramar otro intento.
      // (status lo mutan los eventos async de wwebjs; leemos el valor actual.)
      const s = status as string;
      if (!manualStop && s !== "READY" && s !== "AUTHENTICATED" && s !== "QR_REQUIRED") {
        scheduleReconnect("estado no utilizable tras intento");
      }
    } catch (err: any) {
      reconnecting = false;
      await logStatus("DISCONNECTED", `Auto-reconexión falló: ${err?.message || err}`);
      scheduleReconnect("reintento tras fallo de reconexión");
    }
  }, delay);
}

export async function initWhatsApp() {
  manualStop = false;
  cleanChromiumLocks(); // Clean any stale locks from previous container
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
    // Recuperación automática tras un fallo transitorio de arranque.
    scheduleReconnect(`init failed: ${msg}`);
  }
}

export async function restartSession() {
  manualStop = false;
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
  manualStop = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  reconnecting = false;
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
  manualStop = false;
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
