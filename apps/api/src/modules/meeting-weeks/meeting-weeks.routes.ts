import { Router, Request, Response } from "express";
import { z } from "zod";
import * as service from "./meeting-weeks.service";

const router = Router();

const createSchema = z.object({
  weekStartDate: z.coerce.date(),
  meetingDate: z.coerce.date(),
  meetingTime: z.string().min(1),
  congregationName: z.string().optional(),
  notes: z.string().optional(),
});

const updateSchema = createSchema.partial();

router.get("/", async (_req: Request, res: Response) => {
  res.json(await service.listMeetingWeeks());
});

router.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await service.getMeetingWeek(req.params.id));
  } catch { res.status(404).json({ error: "Not found" }); }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body);
    res.status(201).json(await service.createMeetingWeek(data));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const data = updateSchema.parse(req.body);
    res.json(await service.updateMeetingWeek(req.params.id, data));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.delete("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    await service.deleteMeetingWeek(req.params.id);
    res.status(204).end();
  } catch { res.status(404).json({ error: "Not found" }); }
});

export default router;
