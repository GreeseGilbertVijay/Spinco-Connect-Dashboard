import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import {
  deleteStoredImage,
  detectImageType,
  isAllowedImageType,
  MAX_IMAGE_BYTES,
  readMultipartForm,
  saveImage,
  UploadTooLargeError,
  verifyImageContents,
} from "@/lib/storage";

export async function GET() {
  if (!(await requireAdmin())) return errorResponse("Sign in required.", 401);
  const images = await prisma.image.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { assignedTo: true } } },
  });
  return Response.json(
    images.map((image) => ({
      id: image.id,
      name: image.originalName,
      mimeType: image.mimeType,
      size: image.size,
      createdAt: image.createdAt,
      assignedCount: image._count.assignedTo,
      url: `/api/admin/images/${image.id}/file`,
    })),
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  if (!(await requireAdmin())) return errorResponse("Sign in required.", 401);
  let form: FormData;
  try {
    form = await readMultipartForm(request);
  } catch (reason) {
    if (reason instanceof UploadTooLargeError) return errorResponse("Upload request exceeds the 10 MB image limit.", 413);
    return errorResponse("Upload a valid image file.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return errorResponse("Choose an image to upload.", 400);
  if (file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    return errorResponse("Images must be smaller than 10 MB.", 413);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = detectImageType(bytes);
  if (!mimeType || !isAllowedImageType(mimeType)) {
    return errorResponse("Only valid JPEG, PNG, GIF, and WebP image files are supported.", 415);
  }
  try {
    await verifyImageContents(bytes, mimeType);
  } catch {
    return errorResponse("The uploaded image is malformed or cannot be decoded.", 415);
  }
  const storageKey = await saveImage(bytes, mimeType);
  try {
    const image = await prisma.image.create({
      data: {
        originalName: file.name.slice(0, 180) || "Uploaded image",
        storageKey,
        mimeType,
        size: bytes.byteLength,
      },
    });
    return Response.json({ id: image.id, name: image.originalName, url: `/api/admin/images/${image.id}/file` }, { status: 201 });
  } catch (error) {
    await deleteStoredImage(storageKey);
    throw error;
  }
}
