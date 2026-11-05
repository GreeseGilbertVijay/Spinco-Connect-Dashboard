import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { deviceScope, notRevoked } from "@/lib/device-rules";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  const admin = await requireAdmin();
  if (!admin) return errorResponse("Sign in required.", 401);
  const { id } = await context.params;
  const device = await prisma.device.updateMany({
    where: { id, ...deviceScope(admin), ...notRevoked },
    data: { revokedAt: new Date() },
  });
  if (!device.count) return errorResponse("TV not found or already revoked.", 404);
  await prisma.pairing.updateMany({
    where: { deviceId: id },
    data: { encryptedToken: null },
  });
  return Response.json({ ok: true });
}
