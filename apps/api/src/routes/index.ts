import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes.js";
import dashboardRoutes from "../modules/dashboard/dashboard.routes.js";
import configRoutes from "../modules/config/config.routes.js";
import publishersRoutes from "../modules/publishers/publishers.routes.js";
import meetingWeeksRoutes from "../modules/meeting-weeks/meeting-weeks.routes.js";
import assignmentsRoutes from "../modules/assignments/assignments.routes.js";
import remindersRoutes from "../modules/reminders/reminders.routes.js";
import messageTemplatesRoutes from "../modules/message-templates/message-templates.routes.js";
import messageLogsRoutes from "../modules/message-logs/message-logs.routes.js";
import whatsappRoutes from "../modules/whatsapp/whatsapp.routes.js";
import monthlySchedulesRoutes from "../modules/monthly-schedules/monthly-schedules.routes.js";
import automationCenterRoutes from "../modules/automation-center/automation-center.routes.js";
import importsRoutes from "../modules/imports/imports.routes.js";
import { authMiddleware } from "../middleware/auth.js";

export const apiRouter = Router();

// Public routes
apiRouter.use("/auth", authRoutes);

// Protected routes
apiRouter.use("/dashboard", authMiddleware, dashboardRoutes);
apiRouter.use("/config", authMiddleware, configRoutes);
apiRouter.use("/publishers", authMiddleware, publishersRoutes);
apiRouter.use("/meeting-weeks", authMiddleware, meetingWeeksRoutes);
apiRouter.use("/monthly-schedules", authMiddleware, monthlySchedulesRoutes);
apiRouter.use("/imports", authMiddleware, importsRoutes);
apiRouter.use("/assignments", authMiddleware, assignmentsRoutes);
apiRouter.use("/reminders", authMiddleware, remindersRoutes);
apiRouter.use("/automation-center", authMiddleware, automationCenterRoutes);
apiRouter.use("/message-templates", authMiddleware, messageTemplatesRoutes);
apiRouter.use("/message-logs", authMiddleware, messageLogsRoutes);
apiRouter.use("/whatsapp", authMiddleware, whatsappRoutes);
