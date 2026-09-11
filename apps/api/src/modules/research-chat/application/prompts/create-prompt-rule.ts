import { prisma } from "@jw-reminders/database";

export async function createPromptRule(name: string, content: string, createdById: string) {
  if (!name || !content) {
    throw new Error("name y content requeridos");
  }

  // Get next version
  const latest = await prisma.researchPromptRule.findFirst({
    where: { name },
    orderBy: { version: "desc" },
  });
  const nextVersion = (latest?.version || 0) + 1;

  // Deactivate previous versions
  await prisma.researchPromptRule.updateMany({
    where: { name, isActive: true },
    data: { isActive: false },
  });

  return await prisma.researchPromptRule.create({
    data: {
      name,
      version: nextVersion,
      content,
      isActive: true,
      createdById,
    },
  });
}
