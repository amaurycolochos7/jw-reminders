import { prisma } from "@jw-reminders/database";

export async function listPendingReminders() {
  return prisma.reminderDelivery.findMany({
    where: { status: { in: ["PENDING", "QUEUED", "SENDING", "FAILED"] } },
    include: {
      assignment: { include: { meetingWeek: true } },
      publisher: true,
      automationPlan: true,
    },
    orderBy: { scheduledAt: "asc" },
  });
}

export async function getReminderStats() {
  const [pending, sent, failed, cancelled, dead] = await Promise.all([
    prisma.reminderDelivery.count({ where: { status: "PENDING" } }),
    prisma.reminderDelivery.count({ where: { status: "SENT" } }),
    prisma.reminderDelivery.count({ where: { status: "FAILED" } }),
    prisma.reminderDelivery.count({ where: { status: "CANCELLED" } }),
    prisma.reminderDelivery.count({ where: { status: "DEAD" } }),
  ]);
  return { pending, sent, failed, cancelled, dead, total: pending + sent + failed + cancelled + dead };
}

