import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { deviceScope, MAX_SLIDE_SECONDS, MAX_SLIDES, MIN_SLIDE_SECONDS, notRevoked } from "@/lib/device-rules";
import { prisma } from "@/lib/prisma";

const assignmentSchema = z.object({
  imageIds: z.array(z.string().min(1)).max(MAX_SLIDES).refine((ids) => new Set(ids).size === ids.length),
  slideIntervalSeconds: z.number().int().min(MIN_SLIDE_SECONDS).max(MAX_SLIDE_SECONDS).optional(),
});
type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  const admin = await requireAdmin();
  if (!admin) return errorResponse("Sign in required.", 401);
  const parsed = assignmentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(`Choose up to ${MAX_SLIDES} files, each once, and ${MIN_SLIDE_SECONDS}-${MAX_SLIDE_SECONDS} seconds per slide.`, 400);
  }
  const { imageIds, slideIntervalSeconds } = parsed.data;
  const { id } = await context.params;
  const files = await prisma.image.findMany({ where: { id: { in: imageIds } }, select: { mimeType: true } });
  if (files.length !== imageIds.length) return errorResponse("A selected file does not exist.", 404);
  if (imageIds.length > 1 && files.some((file) => !file.mimeType.startsWith("image/"))) {
    return errorResponse("A slideshow can only contain images.", 400);
  }
  const content = {
    assignedImageId: imageIds[0] ?? null,
    slideImageIds: imageIds,
    ...(slideIntervalSeconds === undefined ? {} : { slideIntervalSeconds }),
    assignmentVersion: { increment: 1 },
    lastError: null,
    lastErrorAt: null,
  };
  const updated = await prisma.device.updateMany({
    where: { id, ...deviceScope(admin), ...notRevoked },
    // Choosing content directly for a TV that follows another one ends that connection.
    data: { ...content, mirrorOfId: null },
  });
  if (!updated.count) return errorResponse("TV not found or access has been revoked.", 404);
  await prisma.device.updateMany({ where: { mirrorOfId: id }, data: content });
  return Response.json({ ok: true });
}
