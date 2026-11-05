import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { deviceScope, notRevoked } from "@/lib/device-rules";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  fit: z.enum(["contain", "cover"]).optional(),
  mirrorOfId: z.null().optional(),
}).refine((value) => value.name !== undefined || value.fit !== undefined || value.mirrorOfId !== undefined);

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  const admin = await requireAdmin();
  if (!admin) return errorResponse("Sign in required.", 401);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Enter a TV name and/or a valid image fit.", 400);
  const { id } = await context.params;
  const result = await prisma.device.updateMany({
    where: { id, ...deviceScope(admin), ...notRevoked },
    data: parsed.data,
  });
  if (!result.count) return errorResponse("TV not found or access has been revoked.", 404);
  if (parsed.data.fit) await prisma.device.updateMany({ where: { mirrorOfId: id }, data: { fit: parsed.data.fit } });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  const admin = await requireAdmin();
  if (!admin) return errorResponse("Sign in required.", 401);
  const { id } = await context.params;
  const result = await prisma.device.deleteMany({ where: { id, ...deviceScope(admin) } });
  if (!result.count) return errorResponse("TV not found.", 404);
  await prisma.device.updateMany({ where: { mirrorOfId: id }, data: { mirrorOfId: null } });
  return Response.json({ ok: true });
}
