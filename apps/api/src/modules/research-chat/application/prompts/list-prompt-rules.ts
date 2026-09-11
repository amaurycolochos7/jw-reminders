import { prisma } from "@jw-reminders/database";

export async function listPromptRules() {
  return await prisma.researchPromptRule.findMany({
    orderBy: { version: "desc" },
  });
}
