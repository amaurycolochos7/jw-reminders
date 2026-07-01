import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "@jw-reminders/database";
import { addDaysToLocalDate } from "../../services/date-utils.js";
import { createAutomationEvent, monthlyScheduleParts } from "../../services/automation.service.js";
import * as service from "./monthly-schedules.service.js";

const router = Router();

const createSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  name: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED", "CANCELLED"]).optional(),
});

const generateWeeksSchema = z.object({
  meetingDayOfWeek: z.number().int().min(0).max(6).default(5),
  meetingTime: z.string().regex(/^\d{2}:\d{2}$/).default("19:00"),
  congregationName: z.string().optional(),
  notes: z.string().optional(),
});

function localDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function localDateToUtcMidnight(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function meetingDatesForMonth(year: number, month: number, meetingDayOfWeek: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dates: string[] = [];

  for (let day = 1; day <= lastDay; day += 1) {
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCDay() === meetingDayOfWeek) {
      dates.push(localDate(year, month, day));
    }
  }

  return dates;
}

router.get("/", async (_req: Request, res: Response) => {
  res.json(await service.listMonthlySchedules());
});

router.get("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await service.getMonthlyScheduleDetail(req.params.id));
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const data = createSchema.parse(req.body);
    const parts = monthlyScheduleParts(`${data.year}-${String(data.month).padStart(2, "0")}-01`);
    const schedule = await prisma.monthlySchedule.upsert({
      where: { year_month: { year: data.year, month: data.month } },
      update: { name: data.name || parts.name },
      create: { year: data.year, month: data.month, name: data.name || parts.name, status: "ACTIVE" },
    });
    await prisma.jwAutomationEvent.create({
      data: {
        eventType: "MONTHLY_PROGRAM_CREATED",
        entityType: "MonthlySchedule",
        entityId: schedule.id,
        actorType: "admin",
        metadata: { year: data.year, month: data.month },
      },
    });
    res.status(201).json(schedule);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.put("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const data = updateSchema.parse(req.body);
    const schedule = await prisma.monthlySchedule.update({
      where: { id: req.params.id },
      data: {
        ...data,
        archivedAt: data.status === "ARCHIVED" ? new Date() : undefined,
        cancelledAt: data.status === "CANCELLED" ? new Date() : undefined,
        completedAt: data.status === "COMPLETED" ? new Date() : undefined,
      },
    });
    await createAutomationEvent(prisma, {
      eventType:
        data.status === "ARCHIVED"
          ? "MONTHLY_PROGRAM_ARCHIVED"
          : data.status === "COMPLETED"
            ? "MONTHLY_PROGRAM_COMPLETED"
            : data.status === "CANCELLED"
              ? "MONTHLY_PROGRAM_CANCELLED"
              : "MONTHLY_PROGRAM_UPDATED",
      entityType: "MonthlySchedule",
      entityId: schedule.id,
      actorType: "admin",
      metadata: data,
    });
    res.json(schedule);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const mode = req.query.mode === "archive" ? "archive" : "delete";
    res.json(await service.deleteMonthlySchedule(req.params.id, mode));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/generate-weeks", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const data = generateWeeksSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const schedule = await tx.monthlySchedule.findUniqueOrThrow({
        where: { id: req.params.id },
        include: { weeks: true },
      });
      const existingMeetingDates = new Set(schedule.weeks.map((week) => week.meetingDateLocal));
      const dates = meetingDatesForMonth(schedule.year, schedule.month, data.meetingDayOfWeek);

      let created = 0;
      for (const meetingDateLocal of dates) {
        if (existingMeetingDates.has(meetingDateLocal)) continue;

        const dayOfWeek = new Date(`${meetingDateLocal}T00:00:00.000Z`).getUTCDay();
        const daysFromMonday = (dayOfWeek + 6) % 7;
        const weekStartLocal = addDaysToLocalDate(meetingDateLocal, -daysFromMonday);

        await tx.jwMeetingWeek.create({
          data: {
            monthlyScheduleId: schedule.id,
            weekStartDate: localDateToUtcMidnight(weekStartLocal),
            meetingDate: localDateToUtcMidnight(meetingDateLocal),
            weekStartDateLocal: weekStartLocal,
            meetingDateLocal,
            meetingTime: data.meetingTime,
            congregationName: data.congregationName,
            notes: data.notes,
            status: "READY",
          },
        });
        created += 1;
      }

      if (created > 0) {
        await createAutomationEvent(tx, {
          eventType: "MONTHLY_WEEKS_GENERATED",
          entityType: "MonthlySchedule",
          entityId: schedule.id,
          actorType: "admin",
          metadata: {
            created,
            meetingDayOfWeek: data.meetingDayOfWeek,
            meetingTime: data.meetingTime,
          },
        });
      }

      return { created, totalMeetingDates: dates.length };
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/generate-assignments", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await service.generateAssignmentsDirect(req.params.id));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/generate-automations", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await service.generateProgramAutomations(req.params.id));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/regenerate-pending", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await service.regenerateProgramPending(req.params.id));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/cancel-pending", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await service.cancelProgramPending(req.params.id));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/:id/proposal", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await service.getProposal(req.params.id));
  } catch {
    res.status(404).json({ error: "Not found" });
  }
});

router.post("/:id/generate-proposal", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const allow = req.body?.allowSamePersonTwicePerWeek === true;
    res.json(await service.generateProposal(req.params.id, { allowSamePersonTwicePerWeek: allow }));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/regenerate-proposal", async (req: Request<{ id: string }>, res: Response) => {
  try {
    const allow = req.body?.allowSamePersonTwicePerWeek === true;
    res.json(await service.regenerateProposal(req.params.id, { allowSamePersonTwicePerWeek: allow }));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/discard-proposal", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await service.discardProposal(req.params.id));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:id/approve-proposal", async (req: Request<{ id: string }>, res: Response) => {
  try {
    res.json(await service.approveProposal(req.params.id));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
