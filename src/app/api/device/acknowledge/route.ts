import { z } from "zod";
import { requireDevice } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { notRevoked } from "@/lib/device-rules";
import { prisma } from "@/lib/prisma";

const acknowledgementSchema = z.object({
  imageId: z.string().min(1),
  version: z.number().int().nonnegative(),
});

export async function POST(request: Request) {
  const device = await requireDevice(request);
  if (!device) return errorResponse("Device access is invalid or revoked.", 401);
  const parsed = acknowledgementSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Invalid image acknowledgement.", 400);
  const image = await prisma.image.findUnique({ where: { id: parsed.data.imageId }, select: { originalName: true } });
  if (!image) return errorResponse("The acknowledged image no longer exists.", 409);
  const updated = await prisma.device.updateMany({
    where: {
      id: device.id,
      ...notRevoked,
      assignedImageId: parsed.data.imageId,
      assignmentVersion: parsed.data.version,
    },
    data: {
      lastDisplayedImageId: parsed.data.imageId,
      lastDisplayedImageName: image.originalName,
      lastDisplayedAt: new Date(),
      lastError: null,
      lastErrorAt: null,
    },
  });
  if (!updated.count) return errorResponse("The acknowledgement does not match the current assignment.", 409);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
