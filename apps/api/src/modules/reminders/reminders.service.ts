import { prisma } from "@jw-reminders/database";

export async function listPendingReminders() {
  return prisma.jwAssignmentReminder.findMany({
    where: { status: "PENDING" },
    include: { assignment: true, publisher: true },
    orderBy: { scheduledAt: "asc" },
  });
}

export async function getReminderStats() {
  const [pending, sent, failed] = await Promise.all([
    prisma.jwAssignmentReminder.count({ where: { status: "PENDING" } }),
    prisma.jwAssignmentReminder.count({ where: { status: "SENT" } }),
    prisma.jwAssignmentReminder.count({ where: { status: "FAILED" } }),
  ]);
  return { pending, sent, failed, total: pending + sent + failed };
}
