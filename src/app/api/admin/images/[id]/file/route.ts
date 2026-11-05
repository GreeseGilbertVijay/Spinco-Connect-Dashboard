import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { readStoredImage } from "@/lib/storage";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  if (!(await requireAdmin())) return errorResponse("Sign in required.", 401);
  const { id } = await context.params;
  const image = await prisma.image.findUnique({ where: { id } });
  if (!image) return errorResponse("Image not found.", 404);
  const bytes = await readStoredImage(image.storageKey);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": image.mimeType,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
