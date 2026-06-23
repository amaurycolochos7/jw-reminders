import { Router } from "express";
import { prisma } from "@jw-reminders/database";

const router = Router();

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
      systemStatus: {
        whatsapp: "waiting_qr",
        worker: "running",
        database: "connected",
      },
    });
  } catch (err) {
    res.json({
      stats: { publicadores: 0, asignacionesPendientes: 0, recordatoriosHoy: 0, mensajesEnviados: 0 },
      assignments: [],
      systemStatus: { whatsapp: "waiting_qr", worker: "running", database: "connected" },
    });
  }
});

export default router;
