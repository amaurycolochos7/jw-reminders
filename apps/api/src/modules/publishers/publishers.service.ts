import { prisma } from "@jw-reminders/database";

export async function listPublishers(search?: string) {
  return prisma.jwPublisher.findMany({
    where: search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
            { displayName: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: { fullName: "asc" },
  });
}

export async function getPublisher(id: string) {
  return prisma.jwPublisher.findUniqueOrThrow({ where: { id } });
}

export async function createPublisher(data: any) {
  return prisma.jwPublisher.create({ data });
}

export async function updatePublisher(id: string, data: any) {
  return prisma.jwPublisher.update({ where: { id }, data });
}

export async function toggleActive(id: string) {
  const pub = await prisma.jwPublisher.findUniqueOrThrow({ where: { id } });
  return prisma.jwPublisher.update({ where: { id }, data: { isActive: !pub.isActive } });
}
