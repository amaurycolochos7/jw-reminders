import { Router, Request, Response } from "express";
import { z } from "zod";
import * as service from "./assignments.service.js";

const router = Router();

const createSchema = z.object({
  meetingWeekId: z.string().min(1),
  assignmentNumber: z.number().int(),
  section: z.enum(["BIBLE_READING", "APPLY_YOURSELF"]),
  assignmentType: z.enum(["BIBLE_READING", "START_CONVERSATION", "MAKE_RETURN_VISIT", "BIBLE_STUDY", "EXPLAIN_BELIEFS", "MAKE_DISCIPLES", "TALK", "OTHER"]),
  title: z.string().min(1),
  durationMinutes: z.number().int().optional(),
  context: z.string().optional(),
  reference: z.string().optional(),
  assignedPublisherId: z.string().min(1),
  companionPublisherId: z.string().optional(),
  room: z.enum(["MAIN", "AUXILIARY"]),
  notes: z.string().optional(),
});

const updateSchema = createSchema.partial();

router.get("/", async (req: Request, res: Response) => {
  const meetingWeekId = req.query.meetingWeekId as string | undefined;
  res.json(await service.listAssignments(meetingWeekId));
});

router.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await service.getAssignment(req.params.id));
  } catch { res.status(404).json({ error: "Not found" }); }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body);
    res.status(201).json(await service.createAssignment(data));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.put("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const data = updateSchema.parse(req.body);
    res.json(await service.updateAssignment(req.params.id, data));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.post("/:id/generate-reminders", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const result = await service.generateReminders(req.params.id);
    res.json({ created: result.count });
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

router.patch("/:id/cancel", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await service.cancelAssignment(req.params.id));
  } catch { res.status(404).json({ error: "Not found" }); }
});

router.patch("/:id/complete", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await service.completeAssignment(req.params.id));
  } catch { res.status(404).json({ error: "Not found" }); }
});

export default router;
