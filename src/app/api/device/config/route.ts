import { requireDevice } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const device = await requireDevice(request);
  if (!device) return errorResponse("Device access is invalid or revoked.", 401);
  const assignedImage = device.assignedImageId
    ? await prisma.image.findUnique({ where: { id: device.assignedImageId }, select: { mimeType: true, size: true } })
    : null;
  return Response.json(
    {
      fit: device.fit === "cover" ? "cover" : "contain",
      assignment: device.assignedImageId
        ? {
            id: device.assignedImageId,
            version: device.assignmentVersion,
            url: `/api/device/images/${encodeURIComponent(device.assignedImageId)}?version=${device.assignmentVersion}`,
            mimeType: assignedImage?.mimeType ?? "image/jpeg",
            size: assignedImage?.size ?? 0,
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
