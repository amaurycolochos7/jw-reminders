import { Router, Request, Response } from "express";
import { prisma } from "@jw-reminders/database";

const router = Router();

router.get("/status", async (_req: Request, res: Response) => {
  const latest = await prisma.jwWhatsappSessionLog.findFirst({ orderBy: { createdAt: "desc" } });
  res.json({ status: latest?.status || "DISCONNECTED", message: latest?.message });
});

router.post("/send-test", async (req: Request, res: Response) => {
  const { phone, message } = req.body;
  if (!phone || !message) {
    return res.status(400).json({ error: "phone and message required" });
  }
  // Placeholder - actual WhatsApp integration to be implemented
  res.json({ success: true, message: "Test message queued (not yet implemented)" });
});

export default router;
