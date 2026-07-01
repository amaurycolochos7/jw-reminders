import { Router, Request, Response } from "express";
import { z } from "zod";
import * as service from "./meeting-weeks.service.js";
import { importWeekFromWol } from "../../services/wol/wol-importer.service.js";

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

router.post("/:id/generate-automations", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await service.generateWeekAutomations(req.params.id));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// Reintentar la importación del programa real de WOL para esta semana.
router.post("/:id/import-wol", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await importWeekFromWol(req.params.id));
  } catch (err: any) { res.status(400).json({ error: err.message }); }
});

// Programa importado de la semana (para "Ver programa").
router.get("/:id/program", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await service.getWeekProgram(req.params.id));
  } catch { res.status(404).json({ error: "Not found" }); }
});

router.delete("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const raw = req.query.mode;
    const mode = raw === "delete" ? "delete" : raw === "archive" ? "archive" : undefined;
    const result = await service.deleteMeetingWeek(req.params.id, mode);
    res.json(result);
  } catch { res.status(404).json({ error: "Not found" }); }
});

export default router;
