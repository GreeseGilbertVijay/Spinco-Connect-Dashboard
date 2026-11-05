import { requireDevice } from "@/lib/auth";
import { canReadAssignedImage } from "@/lib/device-rules";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { readStoredImage } from "@/lib/storage";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const device = await requireDevice(request);
  if (!device) return errorResponse("Device access is invalid or revoked.", 401);
  const { id } = await context.params;
  const version = Number(new URL(request.url).searchParams.get("version"));
  if (!Number.isSafeInteger(version) || !canReadAssignedImage(device, id, version)) {
    return errorResponse("This image is not assigned to this player.", 404);
  }
  const image = await prisma.image.findUnique({ where: { id } });
  if (!image) return errorResponse("Assigned image was not found.", 404);
  const bytes = await readStoredImage(image.storageKey);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
