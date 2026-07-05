import express from "express";
import { initWhatsApp, status, lastQR, connectedNumber, lastConnected, lastDisconnected, lastError, restartSession, disconnectSession, generateQR, getClient, gracefulShutdown, waitForAck } from "./client/whatsapp.js";
import { sendMessage } from "./services/message-sender.js";
import { sendWithTypingAndAck, generateTypingDurationMs } from "./services/typing-sender.js";

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

// ─── Envío con espera de ACK real ──────────────────────────────────────────
// El worker usará este endpoint para confirmar entrega antes de marcar SENT.
app.post("/send-and-wait-ack", async (req, res) => {
  const { phone, message, idempotencyKey, waitSeconds = 60, minAck = 1 } = req.body;
  if (!phone || !message) return res.status(400).json({ error: "phone and message required" });

  // 1. Enviar normalmente
  const result = await sendMessage(phone, message, idempotencyKey);

  // Si no se envió (NOT_READY, REJECTED, dedup), responder inmediatamente
  if (!result.success && result.outcome !== "SENT") {
    const code = result.outcome === "NOT_READY" ? 503 : result.outcome === "REJECTED" ? 422 : 202;
    return res.status(code).json(result);
  }
  if (result.outcome === "DEDUPED") {
    return res.json(result);
  }

  const messageId = result.messageId;
  if (!messageId) {
    return res.json({ ...result, ack: null, ackOutcome: "NO_MESSAGE_ID" });
  }

  // 2. Esperar ACK real
  const timeoutMs = Math.min(Math.max(Number(waitSeconds) || 60, 10), 120) * 1000;
  const ack = await waitForAck(messageId, timeoutMs);

  // 3. Clasificar resultado según ACK
  let ackOutcome: string;
  if (ack === null || ack === 0) {
    ackOutcome = "TIMEOUT_NO_ACK"; // No llegó confirmación: incierto
  } else if (ack === -1) {
    ackOutcome = "REJECTED"; // WhatsApp rechazó la entrega
  } else if (ack === 1) {
    ackOutcome = "SENT_TO_SERVER"; // Servidor aceptó
  } else if (ack === 2) {
    ackOutcome = "DELIVERED"; // Entregado al dispositivo
  } else if (ack >= 3) {
    ackOutcome = "READ"; // Leído
  } else {
    ackOutcome = "UNKNOWN";
  }

  // Si ACK < minAck requerido, reportar como fallo
  const meetsMinAck = ack !== null && ack >= Number(minAck);

  res.json({
    ...result,
    ack,
    ackOutcome,
    meetsMinAck,
    success: meetsMinAck,
    outcome: meetsMinAck ? (ack! >= 2 ? "DELIVERED" : "SENT") : ackOutcome === "REJECTED" ? "REJECTED" : "UNCERTAIN",
  });
});

// ─── Envío con typing obligatorio + espera ACK real ─────────────────────────
// Endpoint definitivo para el worker. Flujo: typing → send → wait ACK.
app.post("/send-with-typing-and-ack", async (req, res) => {
  const { phone, message, idempotencyKey, waitForAckSeconds } = req.body;
  if (!phone || !message) return res.status(400).json({ error: "phone and message required" });

  const result = await sendWithTypingAndAck({ phone, message, idempotencyKey, waitForAckSeconds });

  const code = result.success
    ? 200
    : result.outcome === "NOT_READY" ? 503
    : result.outcome === "REJECTED" ? 422
    : result.outcome === "TYPING_FAILED" ? 503
    : 202; // UNCERTAIN

  res.status(code).json(result);
});

// ─── Diagnóstico temporal: enviar con chatId crudo (probar @lid vs @c.us) ───
app.post("/diagnose-send", async (req, res) => {
  try {
    const { chatId, message, label } = req.body;
    if (!chatId || !message) return res.status(400).json({ error: "chatId and message required" });
    const c = getClient();
    console.log(`[DiagSend] ${label || ''} chatId=${chatId} msg=${message.slice(0, 40)}`);
    const result = await c.sendMessage(chatId, message);
    const messageId = result?.id?.id;
    const ack = result?.ack;
    console.log(`[DiagSend] ${label || ''} result: msgId=${messageId} ack=${ack}`);
    res.json({ success: true, messageId, ack, chatId, label });
  } catch (e: any) {
    console.error(`[DiagSend] Error:`, e.message);
    res.status(500).json({ success: false, error: e.message, chatId: req.body?.chatId, label: req.body?.label });
  }
});

// ─── Diagnóstico temporal: validar número y buscar mensaje por ID ───
app.post("/diagnose", async (req, res) => {
  try {
    const { phone, messageId } = req.body;
    const c = getClient();
    const result: any = {};

    // Validar número
    if (phone) {
      const { toWhatsappNumber } = await import("./services/message-sender.js");
      const normalized = toWhatsappNumber(phone);
      result.normalized = normalized;
      const numberId = await c.getNumberId(normalized);
      result.numberId = numberId;
      result.isRegistered = !!numberId;
    }

    // Buscar mensaje por ID en los chats (intentar ambos formatos)
    if (messageId && phone) {
      const { toWhatsappNumber } = await import("./services/message-sender.js");
      const normalized = toWhatsappNumber(phone);

      // Intentar con @c.us
      const chatIdCus = normalized + "@c.us";
      result.chatIdCus = chatIdCus;

      // Método 1: buscar chat @c.us y listar mensajes recientes
      try {
        const chat = await c.getChatById(chatIdCus);
        result.chatFound = true;
        result.chatName = chat.name;
        const messages = await chat.fetchMessages({ limit: 20 });
        result.messagesInChat = messages.length;
        const found = messages.find((m: any) => m.id?.id === messageId);
        if (found) {
          result.messageFound = true;
          result.messageAck = found.ack;
          result.messageBody = found.body?.slice(0, 80) + "...";
          result.messageTimestamp = found.timestamp;
          result.fromMe = found.fromMe;
        } else {
          result.messageFound = false;
          // Mostrar los últimos mensajes enviados por nosotros
          const fromMe = messages.filter((m: any) => m.fromMe);
          result.ourMessages = fromMe.map((m: any) => ({
            id: m.id?.id,
            ack: m.ack,
            ts: m.timestamp,
            body: m.body?.slice(0, 50),
          }));
        }
      } catch (chatErr: any) {
        result.chatError = chatErr.message;
      }

      // Método 2: getMessageById directo (formato serializado de wwebjs)
      try {
        const serializedId = `true_${chatIdCus}_${messageId}`;
        result.triedSerializedId = serializedId;
        // @ts-ignore - getMessageById exists on Client
        const msg = await c.getMessageById(serializedId);
        if (msg) {
          result.directLookup = true;
          result.directAck = msg.ack;
          result.directBody = msg.body?.slice(0, 80);
          result.directTimestamp = msg.timestamp;
        }
      } catch (lookupErr: any) {
        result.directLookupError = lookupErr.message;
      }
    }

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
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
