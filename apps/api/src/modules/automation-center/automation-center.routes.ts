import { Router, Request, Response } from "express";
import { prisma, ReminderRecipientRole, ReminderStatus } from "@jw-reminders/database";
import { addDaysToLocalDate, localDateLabel, localTimeLabel, localToday, zonedLocalTimeToUtc } from "../../services/date-utils.js";
import { getAutomationConfig } from "../../services/automation.service.js";

const router = Router();

function rangeToDates(range: string | undefined, timeZone: string, dateFrom?: string, dateTo?: string) {
  const today = localToday(timeZone);
  let start = dateFrom || today;
  let endExclusive = dateTo ? addDaysToLocalDate(dateTo, 1) : addDaysToLocalDate(today, 1);

  if (range === "tomorrow") {
    start = addDaysToLocalDate(today, 1);
    endExclusive = addDaysToLocalDate(today, 2);
  } else if (range === "week") {
    start = today;
    endExclusive = addDaysToLocalDate(today, 7);
  } else if (range === "month") {
    start = today;
    endExclusive = addDaysToLocalDate(today, 31);
  } else if (range === "custom" && dateFrom && dateTo) {
    start = dateFrom;
    endExclusive = addDaysToLocalDate(dateTo, 1);
  }

  return {
    startUtc: zonedLocalTimeToUtc(start, 0, 0, timeZone),
    endUtc: zonedLocalTimeToUtc(endExclusive, 0, 0, timeZone),
    start,
    endExclusive,
  };
}

router.get("/", async (req: Request, res: Response) => {
  const config = await getAutomationConfig(prisma);
  const { range, status, role, publisherId, monthlyScheduleId, meetingWeekId, dateFrom, dateTo } = req.query;
  const dates = rangeToDates(range as string | undefined, config.timezone, dateFrom as string | undefined, dateTo as string | undefined);
  const statusValue = status ? String(status).toUpperCase() as ReminderStatus : undefined;
  const roleValue = role ? String(role).toUpperCase() as ReminderRecipientRole : undefined;

  const deliveries = await prisma.reminderDelivery.findMany({
    where: {
      scheduledAt: { gte: dates.startUtc, lt: dates.endUtc },
      ...(statusValue ? { status: statusValue } : {}),
      ...(roleValue ? { recipientRole: roleValue } : {}),
      ...(publisherId ? { publisherId: publisherId as string } : {}),
      ...(meetingWeekId ? { assignment: { meetingWeekId: meetingWeekId as string } } : {}),
      ...(monthlyScheduleId ? { assignment: { meetingWeek: { monthlyScheduleId: monthlyScheduleId as string } } } : {}),
    },
    include: {
      publisher: true,
      automationPlan: true,
      assignment: {
        include: {
          assigned: true,
          companion: true,
          meetingWeek: { include: { monthlySchedule: true } },
        },
      },
      messageLogs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { scheduledAt: "asc" },
  });

  const summary = deliveries.reduce(
    (acc, delivery) => {
      const key = delivery.status.toLowerCase() as keyof typeof acc;
      if (key in acc) acc[key] += 1;
      return acc;
    },
    { pending: 0, queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0, cancelled: 0, dead: 0 },
  );

  const grouped = new Map<string, any[]>();
  for (const delivery of deliveries) {
    const localDate = localDateLabel(delivery.scheduledAt, config.timezone);
    const item = {
      id: delivery.id,
      reminderType: delivery.reminderType,
      recipientRole: delivery.recipientRole,
      status: delivery.status,
      scheduledAt: delivery.scheduledAt,
      localDate,
      localTime: localTimeLabel(delivery.scheduledAt, config.timezone),
      publisher: delivery.publisher,
      assignment: delivery.assignment,
      lastAttempt: delivery.messageLogs[0] || null,
    };
    grouped.set(localDate, [...(grouped.get(localDate) || []), item]);
  }

  res.json({
    range: { start: dates.start, endExclusive: dates.endExclusive, timezone: config.timezone },
    summary,
    groups: Array.from(grouped.entries()).map(([localDate, deliveries]) => ({
      localDate,
      label: localDate === localToday(config.timezone) ? "HOY" : localDate === addDaysToLocalDate(localToday(config.timezone), 1) ? "MANANA" : localDate,
      deliveries,
    })),
  });
});

export default router;

