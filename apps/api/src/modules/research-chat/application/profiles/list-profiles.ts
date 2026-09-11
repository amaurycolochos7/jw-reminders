import { prisma } from "@jw-reminders/database";

export async function listResearchProfiles() {
  return await prisma.researchProfile.findMany({
    where: { isActive: true },
    orderBy: { order: "asc" },
  });
}
