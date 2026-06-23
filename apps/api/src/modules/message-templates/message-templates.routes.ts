import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@jw-reminders/database";

const router = Router();

const updateSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.get("/", async (_req: Request, res: Response) => {
  res.json(await prisma.jwMessageTemplate.findMany());
});

router.put("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const data = updateSchema.parse(req.body);
    res.json(await prisma.jwMessageTemplate.update({ where: { id: req.params.id }, data }));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

export default router;
