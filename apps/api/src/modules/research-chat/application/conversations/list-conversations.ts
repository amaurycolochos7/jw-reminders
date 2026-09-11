import { prisma } from "@jw-reminders/database";

export async function listConversations(userId: string) {
  return await prisma.researchChatSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      profile: { select: { id: true, name: true, themeKey: true } },
      _count: { select: { messages: true } },
    },
  });
}
