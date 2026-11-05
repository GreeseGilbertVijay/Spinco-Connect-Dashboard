import { requireAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { storedFileResponse } from "@/lib/storage";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  if (!(await requireAdmin())) return errorResponse("Sign in required.", 401);
  const { id } = await context.params;
  const image = await prisma.image.findUnique({ where: { id } });
  if (!image) return errorResponse("Image not found.", 404);
  const response = await storedFileResponse(image.storageKey, image.mimeType, "private, max-age=60", request.headers.get("range"));
  return response ?? errorResponse("The file is missing from the server.", 404);
}
