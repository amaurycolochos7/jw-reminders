import express from "express";
import { initWhatsApp, status, lastQR, connectedNumber, lastConnected, lastDisconnected, restartSession } from "./client/whatsapp.js";
import { sendMessage } from "./services/message-sender.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.get("/status", (_req, res) => res.json({
  status,
  qr: lastQR,
  connectedNumber,
  lastConnected,
  lastDisconnected,
}));

app.post("/send", async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: "phone and message required" });
  const result = await sendMessage(phone, message);
  res.status(result.success ? 200 : 400).json(result);
});

app.post("/restart", async (_req, res) => {
  try {
    await restartSession();
    res.json({ success: true, message: "Session restarting" });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

const PORT = Number(process.env.PORT) || 3010;
app.listen(PORT, () => console.log(`[WhatsApp] Server listening on port ${PORT}`));

initWhatsApp().catch((err) => console.error("[WhatsApp] Init failed:", err));
