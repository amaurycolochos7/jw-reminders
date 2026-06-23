import { prisma } from "@jw-reminders/database";
import { WHATSAPP_SEND_DELAY_MS } from "@jw-reminders/shared";
import { renderReminderMessage } from "../services/template-renderer";
import { sendWhatsappMessage } from "../services/whatsapp-client";

const TEST_MODE = process.env.TEST_MODE === "true";
const TEST_PHONE = process.env.TEST_PHONE || "";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processReminders() {
  const pending = await prisma.jwAssignmentReminder.findMany({
    where: {
      status: "PENDING",
      scheduledAt: { lte: new Date() },
    },
    include: {
      assignment: { include: { meetingWeek: true, assigned: true, companion: true } },
      publisher: true,
    },
    take: 50,
  });

  if (pending.length === 0) {
    console.log("[Worker] No pending reminders");
    return;
  }

  console.log(`[Worker] Found ${pending.length} pending reminders`);

  for (const reminder of pending) {
    try {
      const { assignment, publisher } = reminder;
      if (!assignment || !publisher) {
        await prisma.jwAssignmentReminder.update({
          where: { id: reminder.id },
          data: { status: "SKIPPED", errorMessage: "Missing assignment or publisher" },
        });
        continue;
      }

      // Skip cancelled/completed assignments
      if (assignment.status === "CANCELLED" || assignment.status === "COMPLETED") {
        await prisma.jwAssignmentReminder.update({
          where: { id: reminder.id },
          data: { status: "CANCELLED" },
        });
        continue;
      }

      const message = await renderReminderMessage(reminder);
      const phone = TEST_MODE ? TEST_PHONE : (publisher.whatsappPhone || publisher.phone);

      const result = await sendWhatsappMessage(phone, message);

      await prisma.jwAssignmentReminder.update({
        where: { id: reminder.id },
        data: {
          status: result.success ? "SENT" : "FAILED",
          sentAt: result.success ? new Date() : undefined,
          errorMessage: result.error || undefined,
        },
      });

      await prisma.jwMessageLog.create({
        data: {
          assignmentId: assignment.id,
          publisherId: publisher.id,
          phone,
          messageType: reminder.reminderDay,
          messageBody: message,
          providerMessageId: result.messageId || undefined,
          status: result.success ? "SENT" : "FAILED",
          errorMessage: result.error || undefined,
          sentAt: result.success ? new Date() : undefined,
        },
      });

      await delay(WHATSAPP_SEND_DELAY_MS);
    } catch (err) {
      console.error(`[Worker] Error on reminder ${reminder.id}:`, err);
      await prisma.jwAssignmentReminder.update({
        where: { id: reminder.id },
        data: { status: "FAILED", errorMessage: String(err) },
      });
    }
  }
}
