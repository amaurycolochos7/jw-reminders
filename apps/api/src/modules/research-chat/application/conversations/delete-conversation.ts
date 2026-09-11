import { prisma } from "@jw-reminders/database";

export async function deleteConversation(sessionId: string, userId: string) {
  const session = await prisma.researchChatSession.findFirst({
    where: { id: sessionId, userId },
  });

  if (!session) {
    throw new Error("Sesión no encontrada");
  }

  await prisma.researchChatSession.delete({ where: { id: session.id } });
  return { ok: true };
}
