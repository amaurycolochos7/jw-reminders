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
// H4: tope de reintentos automáticos antes de exigir intervención (QR / manual).
const MAX_RECONNECT_ATTEMPTS = 10;
// H4: cuando la desconexión es irrecuperable sin re-escanear (LOGOUT/conflicto),
// se detiene el bucle y se espera un QR nuevo en lugar de reconectar en loop.
let awaitingQr = false;

/**
 * H4 — ¿El motivo de desconexión es irrecuperable sin re-vincular (QR)?
 * whatsapp-web.js emite en `disconnected` un WAState/Reason. LOGOUT, CONFLICT
 * (sesión abierta en otro lado), UNPAIRED (dispositivo desvinculado), BANNED o
 * DEPRECATED_VERSION NO se arreglan reconectando: hay que escanear QR de nuevo.
 * Reconectar en bucle en esos casos causa el "QR constante" y churn de Chromium.
 */
function isUnrecoverableReason(reason: unknown): boolean {
  const r = String(reason ?? "").toUpperCase();
  return (
    r.includes("LOGOUT") ||
    r.includes("CONFLICT") ||
    r.includes("UNPAIRED") ||
    r.includes("BANNED") ||
    r.includes("DEPRECATED")
  );
}

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
        "--disable-accelerated-2d-canvas",
        "--disable-features=LockProfileCookieDatabase",
        // H3: mantener vivo el render en headless (evita "congelar" la pestaña).
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        // NOTA (H3): se ELIMINARON "--single-process" y "--no-zygote" porque son
        // la causa principal de crashes de Chromium ("Target closed") que el
        // sistema interpretaba como desconexiones de WhatsApp. Ver auditoría §3.1.
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
    awaitingQr = false; // ya llegó el QR que esperábamos
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
    awaitingQr = false;
    try { connectedNumber = c.info?.wid?.user || null; } catch {}
    logStatus("READY");
  });

  c.on("disconnected", (reason: string) => {
    lastDisconnected = new Date().toISOString();
    connectedNumber = null;
    // H4: distinguir el motivo. Un logout/conflicto NO se resuelve reconectando.
    if (isUnrecoverableReason(reason)) {
      awaitingQr = true;
      lastError = `Sesión finalizada (${reason}). Se requiere escanear QR nuevamente.`;
      logStatus("QR_REQUIRED", `disconnected irrecuperable: ${reason}`);
      return; // NO entrar en bucle de reconexión.
    }
    logStatus("DISCONNECTED", reason);
    // Recuperación automática solo ante blips transitorios (salvo parada manual).
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
  if (manualStop || reconnecting || awaitingQr) return;
  // H4: tope de reintentos. Al superarlo, se deja de reconectar en bucle y se
  // pide intervención (QR). Evita el churn infinito de Chromium.
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    awaitingQr = true;
    lastError = `Reconexión agotada tras ${MAX_RECONNECT_ATTEMPTS} intentos. Se requiere QR.`;
    await logStatus("QR_REQUIRED", lastError);
    return;
  }
  reconnecting = true;
  reconnectAttempts += 1;
  const delay = reconnectDelayMs();
  console.log(`[WhatsApp] Reconexión automática en ${Math.round(delay / 1000)}s (intento ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}) — ${reason}`);
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
      if (!manualStop && !awaitingQr && s !== "READY" && s !== "AUTHENTICATED" && s !== "QR_REQUIRED") {
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
  awaitingQr = false;
  reconnectAttempts = 0;
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

/**
 * H3 — Apagado limpio. Ante SIGTERM/SIGINT (redeploy, reinicio del contenedor)
 * cerramos Chromium de forma ordenada para NO corromper la sesión de LocalAuth
 * (evita el "hay que escanear el QR de nuevo" tras cada reinicio) y para no dejar
 * procesos Chromium zombis. No hace logout (conserva la sesión).
 */
export async function gracefulShutdown() {
  manualStop = true;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  reconnecting = false;
  try {
    await currentClient.destroy();
    console.log("[WhatsApp] Cliente cerrado limpiamente (graceful shutdown).");
  } catch (e) {
    console.error("[WhatsApp] Error en graceful shutdown:", e);
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
  awaitingQr = false;
  reconnectAttempts = 0;
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
