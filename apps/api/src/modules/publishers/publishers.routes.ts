import { Router, Request, Response } from "express";
import { z } from "zod";
import * as service from "./publishers.service.js";

const router = Router();

const createSchema = z.object({
  fullName: z.string().min(1),
  displayName: z.string().optional(),
  phone: z.string().min(1),
  whatsappPhone: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  isActive: z.boolean().optional(),
  canReceiveAssignments: z.boolean().optional(),
  canBeCompanion: z.boolean().optional(),
  notes: z.string().optional(),
});

const updateSchema = createSchema.partial();

router.get("/", async (req: Request, res: Response) => {
  const search = req.query.search as string | undefined;
  res.json(await service.listPublishers(search));
});

router.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await service.getPublisher(req.params.id));
  } catch { res.status(404).json({ error: "Not found" }); }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body);
    res.status(201).json(await service.createPublisher(data));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const data = updateSchema.parse(req.body);
    res.json(await service.updatePublisher(req.params.id, data));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.patch("/:id/toggle-active", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await service.toggleActive(req.params.id));
  } catch { res.status(404).json({ error: "Not found" }); }
});

export default router;
