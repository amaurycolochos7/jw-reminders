import { prisma } from "@jw-reminders/database";

export async function createConversation(userId: string, title?: string, profileId?: string) {
  let resolvedProfileId = "general";
  if (profileId) {
    const profile = await prisma.researchProfile.findFirst({ where: { id: profileId, isActive: true } });
    if (profile) resolvedProfileId = profile.id;
  }

  return await prisma.researchChatSession.create({
    data: {
      userId,
      title: title || null,
      profileId: resolvedProfileId,
    },
    include: { profile: { select: { id: true, name: true, themeKey: true } } },
  });
}
