import express from "express";
import { initWhatsApp, status, lastQR, connectedNumber, lastConnected, lastDisconnected, lastError, restartSession, disconnectSession, generateQR, getClient, gracefulShutdown } from "./client/whatsapp.js";
import { sendMessage } from "./services/message-sender.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

// Fase 9 — Auth interna: si WHATSAPP_INTERNAL_TOKEN está definido, TODOS los
// endpoints (salvo /health) exigen la cabecera x-internal-token. Así el servicio
// WhatsApp no acepta comandos de envío/sesión de cualquiera dentro de la red.
// En PRODUCCIÓN es OBLIGATORIO: si falta, el proceso NO arranca (no se desactiva
// la auth en silencio).
const INTERNAL_TOKEN = process.env.WHATSAPP_INTERNAL_TOKEN;
if (process.env.NODE_ENV === "production" && (!INTERNAL_TOKEN || INTERNAL_TOKEN.length < 16)) {
  console.error("[WhatsApp] FATAL: WHATSAPP_INTERNAL_TOKEN obligatorio (>=16) en producción.");
  process.exit(1);
}
app.use((req, res, next) => {
  if (req.path === "/health") return next();
  if (!INTERNAL_TOKEN) return next(); // solo dev: se advierte y se permite
  if (req.header("x-internal-token") === INTERNAL_TOKEN) return next();
  return res.status(401).json({ error: "unauthorized (internal token)" });
});

app.get("/status", (_req, res) => {
  let deviceName: string | null = null;
  try {
    const c = getClient();
    deviceName = c?.info?.pushname || null;
  } catch {}

  res.json({
    status,
    qr: lastQR,
    connectedNumber,
    deviceName,
    lastConnected,
    lastDisconnected,
    error: lastError,
  });
});

app.post("/send", async (req, res) => {
  const { phone, message, idempotencyKey } = req.body;
  if (!phone || !message) return res.status(400).json({ error: "phone and message required" });
  const result = await sendMessage(phone, message, idempotencyKey);
  // Mapear outcome → código HTTP. El worker lee `outcome` del cuerpo en todos los casos.
  //  SENT/DEDUPED → 200 | NOT_READY → 503 | REJECTED → 422 | UNCERTAIN → 202
  const code = result.success
    ? 200
    : result.outcome === "NOT_READY"
      ? 503
      : result.outcome === "REJECTED"
        ? 422
        : 202; // UNCERTAIN
  res.status(code).json(result);
});

app.post("/restart", async (_req, res) => {
  try {
    await restartSession();
    res.json({ success: true, message: "Session restarted" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/disconnect", async (_req, res) => {
  try {
    await disconnectSession();
    res.json({ success: true, message: "Session disconnected" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/generate-qr", async (_req, res) => {
  try {
    await generateQR();
    res.json({ success: true, message: "QR generation initiated" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const PORT = Number(process.env.PORT) || 3010;
app.listen(PORT, () => console.log(`[WhatsApp] Server listening on port ${PORT}`));

// Initialize WhatsApp - don't crash if it fails
initWhatsApp().catch((err) => {
  console.error("[WhatsApp] Init failed:", err);
});

// H3 — Apagado limpio ante redeploy/reinicio del contenedor: cierra Chromium de
// forma ordenada para no corromper la sesión ni dejar procesos zombis.
let shuttingDown = false;
const onSignal = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[WhatsApp] Recibido ${signal}, cerrando…`);
  gracefulShutdown()
    .catch((e) => console.error("[WhatsApp] Error al cerrar:", e))
    .finally(() => process.exit(0));
  // Salvaguarda: si destroy() se cuelga, forzar salida.
  setTimeout(() => process.exit(0), 10_000).unref();
};
process.on("SIGTERM", () => onSignal("SIGTERM"));
process.on("SIGINT", () => onSignal("SIGINT"));
