import { prisma } from "@jw-reminders/database";

export async function listAssignments(meetingWeekId?: string) {
  return prisma.jwAssignment.findMany({
    where: meetingWeekId ? { meetingWeekId } : undefined,
    include: { assigned: true, companion: true, meetingWeek: true },
    orderBy: { assignmentNumber: "asc" },
  });
}

export async function getAssignment(id: string) {
  return prisma.jwAssignment.findUniqueOrThrow({
    where: { id },
    include: { assigned: true, companion: true, meetingWeek: true, reminders: true },
  });
}

export async function createAssignment(data: any) {
  return prisma.jwAssignment.create({ data });
}

export async function updateAssignment(id: string, data: any) {
  return prisma.jwAssignment.update({ where: { id }, data });
}

export async function cancelAssignment(id: string) {
  return prisma.jwAssignment.update({ where: { id }, data: { status: "CANCELLED" } });
}

export async function completeAssignment(id: string) {
  return prisma.jwAssignment.update({ where: { id }, data: { status: "COMPLETED" } });
}

export async function generateReminders(id: string) {
  const assignment = await prisma.jwAssignment.findUniqueOrThrow({
    where: { id },
    include: { meetingWeek: true },
  });

  const meetingDate = new Date(assignment.meetingWeek.meetingDate);
  const reminderDays: { type: "SEVEN_DAYS_BEFORE" | "THREE_DAYS_BEFORE" | "ONE_DAY_BEFORE" | "SAME_DAY"; offset: number }[] = [
    { type: "SEVEN_DAYS_BEFORE", offset: 7 },
    { type: "THREE_DAYS_BEFORE", offset: 3 },
    { type: "ONE_DAY_BEFORE", offset: 1 },
    { type: "SAME_DAY", offset: 0 },
  ];

  // Generate reminders for the assigned publisher
  const reminders = reminderDays.map(({ type, offset }) => ({
    assignmentId: id,
    publisherId: assignment.assignedPublisherId,
    reminderDay: type,
    scheduledAt: new Date(meetingDate.getTime() - offset * 24 * 60 * 60 * 1000),
  }));

  // Also generate reminders for the companion if present
  if (assignment.companionPublisherId) {
    reminderDays.forEach(({ type, offset }) => {
      reminders.push({
        assignmentId: id,
        publisherId: assignment.companionPublisherId!,
        reminderDay: type,
        scheduledAt: new Date(meetingDate.getTime() - offset * 24 * 60 * 60 * 1000),
      });
    });
  }

  return prisma.jwAssignmentReminder.createMany({ data: reminders, skipDuplicates: true });
}
