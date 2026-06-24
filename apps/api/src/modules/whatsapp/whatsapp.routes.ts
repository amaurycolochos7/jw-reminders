import { Router, Request, Response } from "express";

const router = Router();
const WA_URL = process.env.WHATSAPP_API_URL || "http://jw-reminders-whatsapp:3010";

router.get("/status", async (_req: Request, res: Response) => {
  try {
    const r = await fetch(`${WA_URL}/status`);
    const data = await r.json();
    res.json(data);
  } catch {
    res.json({
      status: "DISCONNECTED",
      qr: null,
      connectedNumber: null,
      deviceName: null,
      lastConnected: null,
      lastDisconnected: null,
      error: null,
    });
  }
});

router.post("/send-test", async (req: Request, res: Response) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: "phone and message required" });
  try {
    const r = await fetch(`${WA_URL}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message }),
    });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/restart", async (_req: Request, res: Response) => {
  try {
    const r = await fetch(`${WA_URL}/restart`, { method: "POST" });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/disconnect", async (_req: Request, res: Response) => {
  try {
    const r = await fetch(`${WA_URL}/disconnect`, { method: "POST" });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

router.post("/generate-qr", async (_req: Request, res: Response) => {
  try {
    const r = await fetch(`${WA_URL}/generate-qr`, { method: "POST" });
    const data = await r.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

export default router;
