import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes";
import publishersRoutes from "../modules/publishers/publishers.routes";
import meetingWeeksRoutes from "../modules/meeting-weeks/meeting-weeks.routes";
import assignmentsRoutes from "../modules/assignments/assignments.routes";
import remindersRoutes from "../modules/reminders/reminders.routes";
import messageTemplatesRoutes from "../modules/message-templates/message-templates.routes";
import messageLogsRoutes from "../modules/message-logs/message-logs.routes";
import whatsappRoutes from "../modules/whatsapp/whatsapp.routes";
import { authMiddleware } from "../middleware/auth";

export const apiRouter = Router();

// Public routes
apiRouter.use("/auth", authRoutes);

// Protected routes
apiRouter.use("/publishers", authMiddleware, publishersRoutes);
apiRouter.use("/meeting-weeks", authMiddleware, meetingWeeksRoutes);
apiRouter.use("/assignments", authMiddleware, assignmentsRoutes);
apiRouter.use("/reminders", authMiddleware, remindersRoutes);
apiRouter.use("/message-templates", authMiddleware, messageTemplatesRoutes);
apiRouter.use("/message-logs", authMiddleware, messageLogsRoutes);
apiRouter.use("/whatsapp", authMiddleware, whatsappRoutes);
