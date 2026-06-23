import { prisma } from "@jw-reminders/database";

export async function listMeetingWeeks() {
  return prisma.jwMeetingWeek.findMany({ orderBy: { weekStartDate: "desc" } });
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
  return prisma.jwMeetingWeek.delete({ where: { id } });
}
