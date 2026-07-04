import { Router, Request, Response } from "express";
import { prisma } from "@jw-reminders/database";
import { getSendGuard, renderTemplateForTest, sendTemplateTest, sendManual } from "../../services/manual-send.service.js";

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

// ─── Fase 8: mensaje MANUAL y mensaje de PRUEBA (conectados al modelo nuevo) ──

// Mensaje manual (texto libre) con guardia: no envía si pausado o WhatsApp no READY.
// NO crea batches ni deliveries; deja solo un log técnico mínimo.
router.post("/manual-send", async (req: Request, res: Response) => {
  const { phone, message } = req.body || {};
  if (!phone || !message) return res.status(400).json({ error: "phone y message requeridos" });
  const result = await sendManual({ phone, message });
  res.status(result.sent ? 200 : 409).json(result);
});

// Preview del mensaje de prueba (render único, sin enviar).
router.post("/test-template/preview", async (req: Request, res: Response) => {
  const { templateId, publisherId } = req.body || {};
  if (!templateId) return res.status(400).json({ error: "templateId requerido" });
  try {
    res.json(await renderTemplateForTest(templateId, publisherId));
  } catch {
    res.status(404).json({ error: "Plantilla no encontrada" });
  }
});

// Envío de PRUEBA de una plantilla a un teléfono autorizado (no dispara automatización).
router.post("/test-template", async (req: Request, res: Response) => {
  const { templateId, publisherId, targetPhone } = req.body || {};
  if (!templateId || !targetPhone) return res.status(400).json({ error: "templateId y targetPhone requeridos" });
  try {
    const result = await sendTemplateTest({ templateId, publisherId, targetPhone });
    res.status(result.sendResult.sent ? 200 : 409).json(result);
  } catch {
    res.status(404).json({ error: "Plantilla no encontrada" });
  }
});

// Compatibilidad: el antiguo send-test ahora usa el envío manual CON guardia.
router.post("/send-test", async (req: Request, res: Response) => {
  const { phone, message } = req.body;
  if (!phone || !message) return res.status(400).json({ error: "phone and message required" });
  const result = await sendManual({ phone, message });
  res.status(result.sent ? 200 : 409).json(result);
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

// ─── Fase 6: pausa / reanudación / estado combinado de envíos ──────────────

// Estado combinado: pausa manual (AppConfig) + estado de la sesión WhatsApp.
router.get("/send-state", async (_req: Request, res: Response) => {
  const cfg = await prisma.appConfig.findUnique({ where: { key: "SENDS_PAUSED" } });
  const reasonCfg = await prisma.appConfig.findUnique({ where: { key: "SENDS_PAUSE_REASON" } });
  const manualPaused = cfg?.value === "true";
  let whatsappStatus = "UNREACHABLE";
  try {
    const r = await fetch(`${WA_URL}/status`);
    const data: any = await r.json();
    whatsappStatus = String(data?.status ?? "UNKNOWN");
  } catch { /* WhatsApp no responde */ }
  const autoPaused = !manualPaused && whatsappStatus !== "READY";
  res.json({
    manualPaused,
    autoPaused,
    paused: manualPaused || autoPaused,
    pauseReason: manualPaused ? (reasonCfg?.value || "pausado manualmente") : autoPaused ? `WhatsApp no está listo (${whatsappStatus})` : null,
    whatsappStatus,
    canSend: !manualPaused && whatsappStatus === "READY",
  });
});

// Pausa manual (sticky): se mantiene aunque WhatsApp reconecte.
router.post("/pause", async (req: Request, res: Response) => {
  const reason = typeof req.body?.reason === "string" ? req.body.reason : "pausado manualmente";
  await prisma.appConfig.upsert({ where: { key: "SENDS_PAUSED" }, update: { value: "true" }, create: { key: "SENDS_PAUSED", value: "true" } });
  await prisma.appConfig.upsert({ where: { key: "SENDS_PAUSE_REASON" }, update: { value: reason }, create: { key: "SENDS_PAUSE_REASON", value: reason } });
  await prisma.jwAutomationEvent.create({ data: { eventType: "SENDS_PAUSED", entityType: "Worker", entityId: "worker", actorType: "admin", metadata: { reason } } }).catch(() => undefined);
  res.json({ ok: true, paused: true, reason });
});

// Reanudar: quita la pausa manual. Los envíos continúan si WhatsApp está READY.
router.post("/resume", async (_req: Request, res: Response) => {
  await prisma.appConfig.upsert({ where: { key: "SENDS_PAUSED" }, update: { value: "false" }, create: { key: "SENDS_PAUSED", value: "false" } });
  await prisma.jwAutomationEvent.create({ data: { eventType: "SENDS_RESUMED", entityType: "Worker", entityId: "worker", actorType: "admin", metadata: {} } }).catch(() => undefined);
  res.json({ ok: true, paused: false });
});

export default router;
