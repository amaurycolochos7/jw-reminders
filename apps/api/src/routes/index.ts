import { Router } from "express";
import authRoutes from "../modules/auth/auth.routes.js";
import publishersRoutes from "../modules/publishers/publishers.routes.js";
import meetingWeeksRoutes from "../modules/meeting-weeks/meeting-weeks.routes.js";
import assignmentsRoutes from "../modules/assignments/assignments.routes.js";
import remindersRoutes from "../modules/reminders/reminders.routes.js";
import messageTemplatesRoutes from "../modules/message-templates/message-templates.routes.js";
import messageLogsRoutes from "../modules/message-logs/message-logs.routes.js";
import whatsappRoutes from "../modules/whatsapp/whatsapp.routes.js";
import { authMiddleware } from "../middleware/auth.js";

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
