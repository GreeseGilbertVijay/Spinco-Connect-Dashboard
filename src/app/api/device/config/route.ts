import { requireDevice } from "@/lib/auth";
import { DEFAULT_SLIDE_SECONDS, playlistIds } from "@/lib/device-rules";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const device = await requireDevice(request);
  if (!device) return errorResponse("Device access is invalid or revoked.", 401);
  const ids = playlistIds(device);
  const files = await prisma.image.findMany({ where: { id: { in: ids } }, select: { id: true, mimeType: true, size: true } });
  const playlist = ids.map((id) => {
    const file = files.find((candidate) => candidate.id === id);
    return {
      id,
      version: device.assignmentVersion,
      url: `/api/device/images/${encodeURIComponent(id)}?version=${device.assignmentVersion}`,
      mimeType: file?.mimeType ?? "image/jpeg",
      size: file?.size ?? 0,
    };
  });
  return Response.json(
    {
      fit: device.fit === "cover" ? "cover" : "contain",
      slideIntervalSeconds: device.slideIntervalSeconds ?? DEFAULT_SLIDE_SECONDS,
      playlist,
      // Players built before slideshows only read this field.
      assignment: playlist[0] ?? null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
