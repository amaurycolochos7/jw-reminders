import { Router } from "express";
import { prisma } from "@jw-reminders/database";

const router = Router();

router.get("/", async (_req, res) => {
  const configs = await prisma.appConfig.findMany();
  const map: Record<string, string> = {};
  configs.forEach((c) => { map[c.key] = c.value; });
  res.json(map);
});

router.put("/", async (req, res) => {
  const entries = Object.entries(req.body) as [string, string][];
  for (const [key, value] of entries) {
    await prisma.appConfig.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  res.json({ success: true });
});

export default router;
