import { Router } from "express";
import { prisma } from "@jw-reminders/database";

const router = Router();

const WA_URL = process.env.WHATSAPP_API_URL || "http://jw-reminders-whatsapp:3010";

router.get("/", async (_req, res) => {
  try {
    const [publisherCount, pendingAssignments, todayReminders, sentMessages] = await Promise.all([
      prisma.jwPublisher.count({ where: { isActive: true } }),
      prisma.jwAssignment.count({ where: { status: "PENDING" } }),
      prisma.jwAssignmentReminder.count({
        where: { status: "PENDING", scheduledAt: { lte: new Date() } },
      }),
      prisma.jwMessageLog.count({ where: { status: "SENT" } }),
    ]);

    const assignments = await prisma.jwAssignment.findMany({
      where: { status: "PENDING" },
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
        asignacionesPendientes: pendingAssignments,
        recordatoriosHoy: todayReminders,
        mensajesEnviados: sentMessages,
      },
      assignments: assignments.map((a) => ({
        id: a.id,
        date: a.meetingWeek.meetingDate,
        title: a.title,
        assignee: a.assigned.displayName || a.assigned.fullName,
        status: a.status.toLowerCase(),
      })),
      activity,
      systemStatus: {
        whatsapp: whatsappStatus,
        worker: "running",
        database: "connected",
      },
    });
  } catch (err) {
    res.json({
      stats: { publicadores: 0, asignacionesPendientes: 0, recordatoriosHoy: 0, mensajesEnviados: 0 },
      assignments: [],
      activity: [],
      systemStatus: { whatsapp: "disconnected", worker: "running", database: "connected" },
    });
  }
});

export default router;
