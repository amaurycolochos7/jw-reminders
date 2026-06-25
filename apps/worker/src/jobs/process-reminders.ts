import { Prisma, prisma, ReminderStatus, ReminderType } from "@jw-reminders/database";
import { WHATSAPP_SEND_DELAY_MS } from "@jw-reminders/shared";
import { renderReminderMessage } from "../services/template-renderer.js";
import { sendWhatsappMessage } from "../services/whatsapp-client.js";

const TEST_MODE = process.env.TEST_MODE === "true";
const TEST_PHONE = process.env.TEST_PHONE || "";
const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE || 50);

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(nextAttempt: number) {
  if (nextAttempt <= 2) return 10 * 60 * 1000;
  return 30 * 60 * 1000;
}

async function event(eventType: string, entityType: string, entityId: string, metadata: Prisma.InputJsonObject = {}) {
  await prisma.jwAutomationEvent.create({
    data: {
      eventType,
      entityType,
      entityId,
      actorType: "worker",
      metadata,
    },
  });
}

function isSpecialNotice(type: ReminderType) {
  return type === "CHANGE_NOTICE" || type === "CANCELLATION_NOTICE";
}

async function markSkipped(id: string, reason: string) {
  await prisma.reminderDelivery.update({
    where: { id },
    data: { status: "SKIPPED", errorMessage: reason },
  });
  await event("REMINDER_SKIPPED", "ReminderDelivery", id, { reason });
}

async function markCancelled(id: string, reason: string) {
  await prisma.reminderDelivery.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
  });
  await event("REMINDER_CANCELLED", "ReminderDelivery", id, { reason });
}

export async function processReminders() {
  const now = new Date();
  const due = await prisma.reminderDelivery.findMany({
    where: {
      OR: [
        { status: "PENDING", scheduledAt: { lte: now } },
        { status: "FAILED", nextRetryAt: { lte: now } },
      ],
    },
    include: {
      automationPlan: true,
      assignment: { include: { meetingWeek: true, assigned: true, companion: true } },
      publisher: true,
    },
    orderBy: { scheduledAt: "asc" },
    take: BATCH_SIZE,
  });

  if (due.length === 0) {
    console.log("[Worker] No due reminder deliveries");
    return;
  }

  console.log(`[Worker] Found ${due.length} due reminder deliveries`);

  for (const delivery of due) {
    const claimed = await prisma.reminderDelivery.updateMany({
      where: { id: delivery.id, status: delivery.status },
      data: { status: "QUEUED" },
    });

    if (claimed.count === 0) continue;

    await event("REMINDER_QUEUED", "ReminderDelivery", delivery.id, {
      previousStatus: delivery.status,
      reminderType: delivery.reminderType,
    });

    try {
      const fresh = await prisma.reminderDelivery.findUniqueOrThrow({
        where: { id: delivery.id },
        include: {
          automationPlan: true,
          assignment: { include: { meetingWeek: true, assigned: true, companion: true } },
          publisher: true,
        },
      });
      const { automationPlan, assignment, publisher } = fresh;
      const special = isSpecialNotice(fresh.reminderType);

      if (fresh.attemptCount >= fresh.maxAttempts) {
        await prisma.reminderDelivery.update({
          where: { id: fresh.id },
          data: { status: "DEAD", deadAt: new Date(), errorMessage: fresh.errorMessage || "Max attempts reached" },
        });
        await event("REMINDER_DEAD", "ReminderDelivery", fresh.id, { attemptCount: fresh.attemptCount });
        continue;
      }

      if (!automationPlan) {
        await markSkipped(fresh.id, "Missing automation plan");
        continue;
      }
      if (!assignment) {
        await markSkipped(fresh.id, "Missing assignment");
        continue;
      }
      if (!publisher) {
        await markSkipped(fresh.id, "Missing publisher");
        continue;
      }
      if (automationPlan.status === "SUPERSEDED" && !special) {
        await markCancelled(fresh.id, "Automation plan superseded");
        continue;
      }
      if (automationPlan.status === "CANCELLED" && !special) {
        await markCancelled(fresh.id, "Automation plan cancelled");
        continue;
      }
      if (automationPlan.status === "ARCHIVED" && !special) {
        await markSkipped(fresh.id, "Automation plan archived");
        continue;
      }
      if ((assignment.meetingWeek.status === "CANCELLED" || assignment.meetingWeek.status === "ARCHIVED") && !special) {
        await markCancelled(fresh.id, "Meeting week not active");
        continue;
      }
      if (assignment.status === "CANCELLED" && fresh.reminderType !== "CANCELLATION_NOTICE") {
        await markCancelled(fresh.id, "Assignment cancelled");
        continue;
      }
      if (assignment.status === "COMPLETED" && !special) {
        await markCancelled(fresh.id, "Assignment completed");
        continue;
      }
      if (!publisher.isActive || publisher.deletedAt || !publisher.canReceiveAssignments) {
        await markSkipped(fresh.id, "Publisher inactive or cannot receive messages");
        continue;
      }

      await prisma.reminderDelivery.update({
        where: { id: fresh.id },
        data: { status: "SENDING", lastAttemptAt: new Date() },
      });
      await event("REMINDER_SENDING", "ReminderDelivery", fresh.id, { reminderType: fresh.reminderType });

      const message = await renderReminderMessage({ ...fresh, reminderDay: fresh.reminderType });
      const phone = TEST_MODE ? TEST_PHONE : (publisher.whatsappPhone || publisher.phone);
      const result = await sendWhatsappMessage(phone, message);
      const attemptCount = fresh.attemptCount + 1;
      const terminalFailure = !result.success && attemptCount >= fresh.maxAttempts;
      const failedStatus: ReminderStatus = terminalFailure ? "DEAD" : "FAILED";

      await prisma.jwMessageLog.create({
        data: {
          assignmentId: assignment.id,
          publisherId: publisher.id,
          automationPlanId: automationPlan.id,
          reminderDeliveryId: fresh.id,
          phone,
          messageType: fresh.reminderType,
          messageBody: message,
          providerMessageId: result.messageId || undefined,
          status: result.success ? "SENT" : "FAILED",
          errorMessage: result.error || undefined,
          sentAt: result.success ? new Date() : undefined,
        },
      });
      await event("MESSAGE_ATTEMPT_CREATED", "ReminderDelivery", fresh.id, {
        success: result.success,
        attemptCount,
      });

      if (result.success) {
        await prisma.reminderDelivery.update({
          where: { id: fresh.id },
          data: {
            status: "SENT",
            attemptCount,
            sentAt: new Date(),
            errorMessage: null,
            nextRetryAt: null,
          },
        });
        await event("REMINDER_SENT", "ReminderDelivery", fresh.id, { attemptCount });
      } else {
        const nextRetryAt = terminalFailure ? null : new Date(Date.now() + retryDelayMs(attemptCount + 1));
        await prisma.reminderDelivery.update({
          where: { id: fresh.id },
          data: {
            status: failedStatus,
            attemptCount,
            errorMessage: result.error || "Unknown WhatsApp error",
            nextRetryAt,
            deadAt: terminalFailure ? new Date() : null,
          },
        });
        await event("REMINDER_FAILED", "ReminderDelivery", fresh.id, {
          attemptCount,
          terminal: terminalFailure,
          error: result.error,
        });
        if (terminalFailure) {
          await event("REMINDER_DEAD", "ReminderDelivery", fresh.id, { attemptCount });
        } else {
          await event("REMINDER_RETRY_SCHEDULED", "ReminderDelivery", fresh.id, { attemptCount, nextRetryAt });
        }
      }

      await delay(WHATSAPP_SEND_DELAY_MS);
    } catch (err) {
      console.error(`[Worker] Error on reminder delivery ${delivery.id}:`, err);
      await prisma.reminderDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "FAILED",
          errorMessage: String(err),
          attemptCount: { increment: 1 },
          nextRetryAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      });
      await event("REMINDER_FAILED", "ReminderDelivery", delivery.id, { error: String(err) });
    }
  }
}
