import { Router, Request, Response } from "express";
import * as service from "./reminders.service.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  res.json(await service.listPendingReminders());
});

router.get("/stats", async (_req: Request, res: Response) => {
  res.json(await service.getReminderStats());
});

export default router;
