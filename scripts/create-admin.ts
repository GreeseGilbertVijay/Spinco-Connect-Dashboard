import { hash } from "bcryptjs";
import { prisma } from "../src/lib/prisma";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Set ADMIN_EMAIL to a valid email address before creating the admin.");
  }
  if (!password || password.length < 12 || password.length > 200) {
    throw new Error("Set ADMIN_PASSWORD to a unique password between 12 and 200 characters.");
  }
  if (!process.env.SESSION_SECRET || Buffer.byteLength(process.env.SESSION_SECRET) < 32) {
    throw new Error("Set SESSION_SECRET to a random value of at least 32 characters.");
  }
  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) throw new Error(`An admin account already exists for ${email}; refusing to replace its password.`);
  await prisma.admin.create({ data: { email, passwordHash: await hash(password, 12) } });
  console.log(`Created admin account: ${email}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
