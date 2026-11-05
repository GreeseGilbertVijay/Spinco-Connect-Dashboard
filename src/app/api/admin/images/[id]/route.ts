import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { deleteStoredImage } from "@/lib/storage";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  if (!(await requireAdmin())) return errorResponse("Sign in required.", 401);
  const { id } = await context.params;
  const image = await prisma.image.findUnique({ where: { id } });
  if (!image) return errorResponse("Image not found.", 404);
  await prisma.$transaction([
    prisma.device.updateMany({
      where: { assignedImageId: id },
      data: { assignedImageId: null, assignmentVersion: { increment: 1 } },
    }),
    prisma.image.delete({ where: { id } }),
  ]);
  await deleteStoredImage(image.storageKey);
  return Response.json({ ok: true });
}
