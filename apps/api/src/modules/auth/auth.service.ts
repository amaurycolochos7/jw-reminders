import { createHash } from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "@jw-reminders/database";

export async function login(email: string, password: string) {
  const hash = createHash("sha256").update(password).digest("hex");
  const user = await prisma.adminUser.findUnique({ where: { email } });

  if (!user || user.password !== hash) {
    throw new Error("Invalid credentials");
  }

  const token = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET || "secret",
    { expiresIn: "24h" }
  );

  return { token, user: { id: user.id, email: user.email, name: user.name } };
}
