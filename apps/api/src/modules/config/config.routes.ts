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
  const body = (req.body ?? {}) as Record<string, unknown>;
  // Aceptar dos formatos: el mapa { CLAVE: valor } y el par { key, value }.
  // (Este segundo formato causaba filas basura "key"/"value" antes.)
  const entries: [string, string][] =
    typeof body.key === "string" && "value" in body
      ? [[body.key, String(body.value)]]
      : (Object.entries(body).map(([k, v]) => [k, String(v)]) as [string, string][]);
  for (const [key, value] of entries) {
    await prisma.appConfig.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  res.json({ success: true });
});

export default router;
