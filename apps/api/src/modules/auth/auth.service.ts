import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "@jw-reminders/database";
import { getJwtSecret } from "../../config/security.js";

function sha256(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

/** ¿El hash almacenado es bcrypt? ($2a/$2b/$2y...). */
function isBcrypt(hash: string): boolean {
  return /^\$2[aby]?\$/.test(hash);
}

export async function login(email: string, password: string) {
  const user = await prisma.adminUser.findUnique({ where: { email } });
  if (!user) throw new Error("Invalid credentials");

  let valid = false;
  if (isBcrypt(user.password)) {
    valid = await bcrypt.compare(password, user.password);
  } else {
    // Legacy SHA-256 sin sal: se valida y, si es correcto, se MIGRA a bcrypt.
    valid = user.password === sha256(password);
    if (valid) {
      const upgraded = await bcrypt.hash(password, 10);
      await prisma.adminUser.update({ where: { id: user.id }, data: { password: upgraded } }).catch(() => undefined);
    }
  }

  if (!valid) throw new Error("Invalid credentials");

  const token = jwt.sign({ id: user.id, email: user.email }, getJwtSecret(), { expiresIn: "24h" });
  return { token, user: { id: user.id, email: user.email, name: user.name } };
}
