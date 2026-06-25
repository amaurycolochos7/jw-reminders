import { Router } from "express";
import { prisma } from "@jw-reminders/database";
import { addDaysToLocalDate, localTimeLabel, localToday, zonedLocalTimeToUtc } from "../../services/date-utils.js";
import { getAutomationConfig } from "../../services/automation.service.js";

const router = Router();

const WA_URL = process.env.WHATSAPP_API_URL || "http://jw-reminders-whatsapp:3010";

function rangeBounds(startLocal: string, days: number, timeZone: string) {
  return {
    startUtc: zonedLocalTimeToUtc(startLocal, 0, 0, timeZone),
    endUtc: zonedLocalTimeToUtc(addDaysToLocalDate(startLocal, days), 0, 0, timeZone),
  };
}

function summarizeDeliveries(deliveries: any[], timeZone: string) {
  const summary = deliveries.reduce(
    (acc, delivery) => {
      acc.total += 1;
      if (delivery.recipientRole === "ASSIGNED") acc.assigned += 1;
      if (delivery.recipientRole === "COMPANION") acc.companions += 1;
      const key = String(delivery.status).toLowerCase();
      if (key in acc) acc[key as keyof typeof acc] += 1;
      return acc;
    },
    { total: 0, assigned: 0, companions: 0, pending: 0, queued: 0, sending: 0, sent: 0, failed: 0, skipped: 0, cancelled: 0, dead: 0 },
  );

  return {
    ...summary,
    deliveries: deliveries.slice(0, 8).map((delivery) => ({
      id: delivery.id,
      localTime: localTimeLabel(delivery.scheduledAt, timeZone),
      reminderType: delivery.reminderType,
      recipientRole: delivery.recipientRole,
      status: delivery.status,
      publisherName: delivery.publisher?.displayName || delivery.publisher?.fullName || "Sin publicador",
      assignmentTitle: delivery.assignment?.title || "Sin asignacion",
      programName: delivery.assignment?.meetingWeek?.monthlySchedule?.name || null,
    })),
  };
}

router.get("/", async (_req, res) => {
  try {
    const config = await getAutomationConfig(prisma);
    const todayLocal = localToday(config.timezone);
    const tomorrowLocal = addDaysToLocalDate(todayLocal, 1);
    const todayRange = rangeBounds(todayLocal, 1, config.timezone);
    const tomorrowRange = rangeBounds(tomorrowLocal, 1, config.timezone);
    const weekRange = rangeBounds(todayLocal, 7, config.timezone);
    const now = new Date();

    const [publisherCount, pendingAssignments, todayReminders, sentMessages, activeWeeks, pendingReminders, messagesSentToday, failedReminders] = await Promise.all([
      prisma.jwPublisher.count({ where: { isActive: true } }),
      prisma.jwAssignment.count({ where: { status: "DRAFT" } }),
      prisma.reminderDelivery.count({
        where: { status: { in: ["PENDING", "QUEUED", "SENDING"] }, scheduledAt: { gte: todayRange.startUtc, lt: todayRange.endUtc } },
      }),
      prisma.jwMessageLog.count({ where: { status: "SENT" } }),
      prisma.jwMeetingWeek.count({ where: { meetingDate: { gte: todayRange.startUtc }, status: { notIn: ["ARCHIVED", "CANCELLED"] } } }),
      prisma.reminderDelivery.count({ where: { status: { in: ["PENDING", "QUEUED", "SENDING", "FAILED"] } } }),
      prisma.jwMessageLog.count({ where: { status: "SENT", createdAt: { gte: todayRange.startUtc, lt: todayRange.endUtc } } }),
      prisma.reminderDelivery.count({ where: { status: { in: ["FAILED", "DEAD"] } } }),
    ]);

    const assignments = await prisma.jwAssignment.findMany({
      where: { status: { in: ["DRAFT", "SCHEDULED"] } },
      include: { meetingWeek: true, assigned: true },
      orderBy: { meetingWeek: { meetingDate: "asc" } },
      take: 5,
    });

    // Get recent activity from message logs
    const recentLogs = await prisma.jwMessageLog.findMany({
      include: { publisher: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const activity = recentLogs.map((log) => ({
      id: log.id,
      description: `Mensaje ${log.status.toLowerCase()} a ${log.publisher?.displayName || log.publisher?.fullName || log.phone}`,
      time: log.createdAt.toISOString(),
    }));

    const deliveryInclude = {
      publisher: true,
      assignment: {
        include: {
          meetingWeek: { include: { monthlySchedule: true } },
        },
      },
    };

    const [todayDeliveries, tomorrowDeliveries, failedDeliveryRows, weekRows, currentProgram] = await Promise.all([
      prisma.reminderDelivery.findMany({
        where: { scheduledAt: { gte: todayRange.startUtc, lt: todayRange.endUtc } },
        include: deliveryInclude,
        orderBy: { scheduledAt: "asc" },
      }),
      prisma.reminderDelivery.findMany({
        where: { scheduledAt: { gte: tomorrowRange.startUtc, lt: tomorrowRange.endUtc } },
        include: deliveryInclude,
        orderBy: { scheduledAt: "asc" },
      }),
      prisma.reminderDelivery.findMany({
        where: { status: { in: ["FAILED", "DEAD"] } },
        include: {
          ...deliveryInclude,
          messageLogs: { orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      prisma.jwMeetingWeek.findMany({
        where: {
          meetingDate: { gte: weekRange.startUtc, lt: weekRange.endUtc },
          status: { notIn: ["ARCHIVED", "CANCELLED"] },
        },
        include: {
          monthlySchedule: true,
          assignments: {
            include: {
              reminderDeliveries: true,
            },
          },
        },
        orderBy: { meetingDate: "asc" },
        take: 5,
      }),
      prisma.monthlySchedule.findFirst({
        where: {
          year: Number(todayLocal.slice(0, 4)),
          month: Number(todayLocal.slice(5, 7)),
          status: { in: ["ACTIVE", "DRAFT"] },
        },
        include: {
          _count: { select: { weeks: true } },
        },
      }),
    ]);

    const weekStatus = weekRows.map((week) => {
      const deliveries = week.assignments.flatMap((assignment) => assignment.reminderDeliveries);
      const pending = deliveries.filter((delivery) => ["PENDING", "QUEUED", "SENDING", "FAILED"].includes(delivery.status)).length;
      const failed = deliveries.filter((delivery) => ["FAILED", "DEAD"].includes(delivery.status)).length;
      const sent = deliveries.filter((delivery) => delivery.status === "SENT").length;
      return {
        id: week.id,
        meetingDate: week.meetingDate,
        meetingTime: week.meetingTime,
        programName: week.monthlySchedule?.name || null,
        assignmentCount: week.assignments.length,
        deliveryCount: deliveries.length,
        pending,
        failed,
        sent,
        fullyNotified: deliveries.length > 0 && pending === 0 && failed === 0,
      };
    });

    // Get real WhatsApp status
    let whatsappStatus = "disconnected";
    try {
      const waRes = await fetch(`${WA_URL}/status`);
      if (waRes.ok) {
        const waData = await waRes.json();
        const st = (waData.status || "").toUpperCase();
        if (st === "READY") whatsappStatus = "connected";
        else if (st === "QR_REQUIRED" || st === "AUTHENTICATED") whatsappStatus = "waiting_qr";
        else whatsappStatus = "disconnected";
      }
    } catch { /* fallback to disconnected */ }

    res.json({
      stats: {
        publicadores: publisherCount,
        activeWeeks: activeWeeks,
        asignacionesPendientes: pendingAssignments,
        pendingReminders: pendingReminders,
        messagesSentToday: messagesSentToday,
        recordatoriosHoy: todayReminders,
        mensajesEnviados: sentMessages,
        failedReminders,
      },
      assignments: assignments.map((a) => ({
        id: a.id,
        date: a.meetingWeek.meetingDate,
        title: a.title,
        assignee: a.assigned.displayName || a.assigned.fullName,
        status: a.status.toLowerCase(),
      })),
      operations: {
        timezone: config.timezone,
        sendHour: config.sendHour,
        today: summarizeDeliveries(todayDeliveries, config.timezone),
        tomorrow: summarizeDeliveries(tomorrowDeliveries, config.timezone),
        failed: failedDeliveryRows.map((delivery) => ({
          id: delivery.id,
          status: delivery.status,
          reminderType: delivery.reminderType,
          publisherName: delivery.publisher?.displayName || delivery.publisher?.fullName || "Sin publicador",
          assignmentTitle: delivery.assignment?.title || "Sin asignacion",
          programName: delivery.assignment?.meetingWeek?.monthlySchedule?.name || null,
          errorMessage: delivery.messageLogs[0]?.errorMessage || delivery.errorMessage,
          updatedAt: delivery.updatedAt,
        })),
        weekStatus,
        currentProgram: currentProgram ? {
          id: currentProgram.id,
          name: currentProgram.name,
          status: currentProgram.status,
          weekCount: currentProgram._count.weeks,
        } : null,
        generatedAt: now.toISOString(),
      },
      activity,
      systemStatus: {
        whatsapp: whatsappStatus,
        worker: "running",
        database: "connected",
      },
    });
  } catch (err) {
    res.json({
      stats: { publicadores: 0, activeWeeks: 0, asignacionesPendientes: 0, pendingReminders: 0, messagesSentToday: 0, recordatoriosHoy: 0, mensajesEnviados: 0, failedReminders: 0 },
      assignments: [],
      operations: null,
      activity: [],
      systemStatus: { whatsapp: "disconnected", worker: "running", database: "connected" },
    });
  }
});

export default router;
