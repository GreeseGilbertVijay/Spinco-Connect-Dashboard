import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { isPlayerOnline } from "@/lib/device-rules";

export async function GET() {
  if (!(await requireAdmin())) return errorResponse("Sign in required.", 401);
  const devices = await prisma.device.findMany({
    orderBy: { createdAt: "desc" },
    include: { assignedImage: true },
  });
  const now = new Date();
  return Response.json(
    devices.map((device) => ({
      id: device.id,
      deviceId: device.deviceId,
      name: device.name,
      revokedAt: device.revokedAt,
      online: !device.revokedAt && isPlayerOnline(device.lastSeenAt, now),
      lastSeenAt: device.lastSeenAt,
      appState: device.appState,
      fit: device.fit,
      assignmentVersion: device.assignmentVersion,
      assignedImage: device.assignedImage
        ? { id: device.assignedImage.id, name: device.assignedImage.originalName, mimeType: device.assignedImage.mimeType, url: `/api/admin/images/${device.assignedImage.id}/file` }
        : null,
      lastDisplayedImageId: device.lastDisplayedImageId ?? null,
      lastError: device.lastError ?? null,
      lastErrorAt: device.lastErrorAt ?? null,
      lastDisplayed: device.lastDisplayedImageName && device.lastDisplayedAt
        ? { name: device.lastDisplayedImageName, at: device.lastDisplayedAt }
        : null,
    })),
    { headers: { "Cache-Control": "no-store" } },
  );
}
