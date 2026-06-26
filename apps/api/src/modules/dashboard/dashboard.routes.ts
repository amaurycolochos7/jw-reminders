import { Router } from "express";
import { getOperationalCenter } from "./operational-center.service.js";

const router = Router();

function legacyStats(center: Awaited<ReturnType<typeof getOperationalCenter>>) {
  return {
    publicadores: center.publishers.totals.active,
    activeWeeks: center.weeks.totals.active,
    asignacionesPendientes: center.weeks.incomplete.reduce((sum, week) => sum + Math.max(0, week.templateCount - week.assignmentCount), 0),
    pendingReminders: center.automations.nextSeven.pending + center.automations.nextSeven.queued + center.automations.nextSeven.sending,
    messagesSentToday: center.automations.today.sent,
    recordatoriosHoy: center.automations.today.total,
    mensajesEnviados: center.system.lastMessage?.status === "SENT" ? 1 : 0,
    failedReminders: center.automations.failed.total,
  };
}

router.get("/", async (_req, res) => {
  try {
    const operationalCenter = await getOperationalCenter();

    res.json({
      operationalCenter,
      stats: legacyStats(operationalCenter),
      assignments: [],
      operations: {
        timezone: operationalCenter.timezone,
        sendHour: operationalCenter.sendHour,
        today: operationalCenter.automations.today,
        tomorrow: operationalCenter.automations.tomorrow,
        failed: operationalCenter.automations.failed.items,
        weekStatus: operationalCenter.weeks.incomplete,
        currentProgram: operationalCenter.programs.active[0] || operationalCenter.programs.pending[0] || null,
        generatedAt: operationalCenter.generatedAt,
      },
      activity: operationalCenter.system.lastMessage ? [{
        id: operationalCenter.system.lastMessage.id,
        description: `Mensaje ${String(operationalCenter.system.lastMessage.status).toLowerCase()} a ${operationalCenter.system.lastMessage.publisherName}`,
        time: operationalCenter.system.lastMessage.at,
      }] : [],
      systemStatus: {
        whatsapp: operationalCenter.system.whatsapp.ready ? "connected" : operationalCenter.system.whatsapp.status === "QR_REQUIRED" ? "waiting_qr" : "disconnected",
        worker: operationalCenter.system.worker.status === "running" ? "running" : "stopped",
        database: "connected",
      },
    });
  } catch (err) {
    console.error("Operational dashboard failed", err);
    res.status(500).json({
      error: "OPERATIONAL_CENTER_UNAVAILABLE",
      operationalCenter: null,
      stats: {
        publicadores: 0,
        activeWeeks: 0,
        asignacionesPendientes: 0,
        pendingReminders: 0,
        messagesSentToday: 0,
        recordatoriosHoy: 0,
        mensajesEnviados: 0,
        failedReminders: 0,
      },
      assignments: [],
      operations: null,
      activity: [],
      systemStatus: { whatsapp: "disconnected", worker: "stopped", database: "disconnected" },
    });
  }
});

export default router;
