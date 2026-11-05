import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { isSuperAdmin, playlistIds } from "@/lib/device-rules";
import { prisma } from "@/lib/prisma";
import { deleteStoredImage } from "@/lib/storage";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  const admin = await requireAdmin();
  if (!admin) return errorResponse("Sign in required.", 401);
  const { id } = await context.params;
  const image = await prisma.image.findUnique({ where: { id } });
  if (!image) return errorResponse("Image not found.", 404);
  // The library is shared, so a regular account must not pull a file off someone else's TV.
  if (!isSuperAdmin(admin) && await prisma.device.count({ where: { OR: [{ assignedImageId: id }, { slideImageIds: { has: id } }] } })) {
    return errorResponse("This file is in use on a TV.", 409);
  }
  await prisma.$transaction(async (transaction) => {
    const devices = await transaction.device.findMany({
      where: { OR: [{ assignedImageId: id }, { slideImageIds: { has: id } }] },
      select: { id: true, assignedImageId: true, slideImageIds: true },
    });
    for (const device of devices) {
      const remaining = playlistIds(device).filter((imageId) => imageId !== id);
      await transaction.device.update({
        where: { id: device.id },
        data: { assignedImageId: remaining[0] ?? null, slideImageIds: remaining, assignmentVersion: { increment: 1 } },
      });
    }
    await transaction.image.delete({ where: { id } });
  });
  await deleteStoredImage(image.storageKey);
  return Response.json({ ok: true });
}
