import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const assignmentSchema = z.object({ imageId: z.string().min(1).nullable() });
type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  if (!(await requireAdmin())) return errorResponse("Sign in required.", 401);
  const parsed = assignmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Select an image or choose no assignment.", 400);
  const { id } = await context.params;
  if (parsed.data.imageId && !(await prisma.image.findUnique({ where: { id: parsed.data.imageId }, select: { id: true } }))) {
    return errorResponse("The selected image does not exist.", 404);
  }
  const updated = await prisma.device.updateMany({
    where: { id, revokedAt: null },
    data: { assignedImageId: parsed.data.imageId, assignmentVersion: { increment: 1 } },
  });
  if (!updated.count) return errorResponse("TV not found or access has been revoked.", 404);
  return Response.json({ ok: true });
}
