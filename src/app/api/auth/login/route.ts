import { compare } from "bcryptjs";
import { cookies } from "next/headers";
import { z } from "zod";
import { assertSameOrigin, errorResponse, getClientIp } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createSessionToken, sessionCookieName, sessionCookieOptions } from "@/lib/security";

const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  const ip = getClientIp(request);
  if (!(await consumeRateLimit(`admin-login:${ip}`, 8, 15 * 60_000))) {
    return errorResponse("Too many login attempts. Try again in 15 minutes.", 429);
  }

  const parsed = credentialsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Enter a valid email address and password.", 400);
  const admin = await prisma.admin.findUnique({ where: { email: parsed.data.email } });
  if (!admin || !(await compare(parsed.data.password, admin.passwordHash))) {
    return errorResponse("Email or password is incorrect.", 401);
  }
  const token = await createSessionToken(admin.id, admin.email);
  (await cookies()).set(sessionCookieName(), token, sessionCookieOptions());
  return Response.json({ email: admin.email }, { headers: { "Cache-Control": "no-store" } });
}
