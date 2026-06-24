import { prisma } from "@jw-reminders/database";

export async function listMeetingWeeks() {
  return prisma.jwMeetingWeek.findMany({ orderBy: { weekStartDate: "desc" }, include: { _count: { select: { assignments: true } } } });
}

export async function getMeetingWeek(id: string) {
  return prisma.jwMeetingWeek.findUniqueOrThrow({
    where: { id },
    include: { assignments: { include: { assigned: true, companion: true } } },
  });
}

export async function createMeetingWeek(data: any) {
  return prisma.jwMeetingWeek.create({ data });
}

export async function updateMeetingWeek(id: string, data: any) {
  return prisma.jwMeetingWeek.update({ where: { id }, data });
}

export async function deleteMeetingWeek(id: string) {
  // Get all assignments for this week
  const assignments = await prisma.jwAssignment.findMany({
    where: { meetingWeekId: id },
    select: { id: true },
  });

  const assignmentIds = assignments.map((a) => a.id);

  // Delete in order: reminders → message logs → assignments → week
  if (assignmentIds.length > 0) {
    await prisma.jwAssignmentReminder.deleteMany({
      where: { assignmentId: { in: assignmentIds } },
    });
    await prisma.jwMessageLog.deleteMany({
      where: { assignmentId: { in: assignmentIds } },
    });
    await prisma.jwAssignment.deleteMany({
      where: { meetingWeekId: id },
    });
  }

  return prisma.jwMeetingWeek.delete({ where: { id } });
}
