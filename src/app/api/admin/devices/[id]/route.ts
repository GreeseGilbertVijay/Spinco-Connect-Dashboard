import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { notRevoked } from "@/lib/device-rules";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  fit: z.enum(["contain", "cover"]).optional(),
}).refine((value) => value.name !== undefined || value.fit !== undefined);

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  if (!(await requireAdmin())) return errorResponse("Sign in required.", 401);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Enter a TV name and/or a valid image fit.", 400);
  const { id } = await context.params;
  const result = await prisma.device.updateMany({
    where: { id, ...notRevoked },
    data: parsed.data,
  });
  if (!result.count) return errorResponse("TV not found or access has been revoked.", 404);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  if (!(await requireAdmin())) return errorResponse("Sign in required.", 401);
  const { id } = await context.params;
  const result = await prisma.device.deleteMany({ where: { id } });
  if (!result.count) return errorResponse("TV not found.", 404);
  return Response.json({ ok: true });
}
