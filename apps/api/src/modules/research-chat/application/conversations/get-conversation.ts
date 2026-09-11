import { prisma } from "@jw-reminders/database";

export async function getConversation(sessionId: string, userId: string) {
  const session = await prisma.researchChatSession.findFirst({
    where: { id: sessionId, userId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      references: true,
      profile: { select: { id: true, name: true, themeKey: true } },
    },
  });

  if (!session) {
    throw new Error("Sesión no encontrada");
  }

  return session;
}
