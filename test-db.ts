import { prisma } from '@jw-reminders/database';

console.log("[env-check] DATABASE_URL:", process.env.DATABASE_URL?.replace(/:\/\/([^:]+):?([^@]*)@/, "://$1:***@"));
console.log("[env-check] JWT_SECRET length:", process.env.JWT_SECRET?.length ?? 0);

async function main() {
  try {
    const users = await prisma.adminUser.findMany({ take: 5 });
    console.log("[db-test] SUCCESS - AdminUser count:", users.length);
    for (const u of users) {
      console.log(`  - id=${u.id} email=${u.email} name=${u.name}`);
    }
  } catch (e: any) {
    console.error("[db-test] FAILED:", e.message);
  } finally {
    await prisma.$disconnect();
  }
}
main();
