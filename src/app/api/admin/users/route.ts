import { hash } from "bcryptjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { adminName, isPlayerOnline, isSuperAdmin } from "@/lib/device-rules";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const userSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(200),
});

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return errorResponse("Sign in required.", 401);
  if (!isSuperAdmin(admin)) return errorResponse("Only the super admin can manage users.", 403);
  const users = await prisma.admin.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      devices: { select: { lastSeenAt: true, revokedAt: true } },
    },
  });
  const now = new Date();
  return Response.json(
    users.map((user) => ({
      id: user.id,
      name: adminName(user),
      email: user.email,
      superAdmin: isSuperAdmin(user),
      createdAt: user.createdAt,
      tvCount: user.devices.length,
      onlineCount: user.devices.filter((device) => !device.revokedAt && isPlayerOnline(device.lastSeenAt, now)).length,
    })),
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  const admin = await requireAdmin();
  if (!admin) return errorResponse("Sign in required.", 401);
  if (!isSuperAdmin(admin)) return errorResponse("Only the super admin can manage users.", 403);
  const parsed = userSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Enter a name, a valid email and a password of at least 12 characters.", 400);
  const { name, email, password } = parsed.data;
  if (await prisma.admin.findUnique({ where: { email }, select: { id: true } })) {
    return errorResponse("A user with this email already exists.", 409);
  }
  const user = await prisma.admin.create({
    data: { name, email, role: "user", passwordHash: await hash(password, 12) },
    select: { id: true, name: true, email: true },
  });
  return Response.json(user, { status: 201, headers: { "Cache-Control": "no-store" } });
}
