import { requireAdmin } from "@/lib/auth";
import { DriveError } from "@/lib/drive";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { deleteStoredImage, MAX_VIDEO_BYTES, saveVideoStream, UnsupportedVideoError, UploadTooLargeError } from "@/lib/storage";

function fileName(request: Request) {
  try {
    return decodeURIComponent(request.headers.get("x-file-name") ?? "").slice(0, 180) || "Uploaded video";
  } catch {
    return "Uploaded video";
  }
}

// The dashboard sends the file as the raw request body so it can be streamed straight to disk.
export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  if (!(await requireAdmin())) return errorResponse("Sign in required.", 401);
  if (Number(request.headers.get("content-length")) > MAX_VIDEO_BYTES) {
    return errorResponse("Videos must be smaller than 200 MB.", 413);
  }
  if (!request.body) return errorResponse("Choose a video to upload.", 400);
  const originalName = fileName(request);
  let saved: Awaited<ReturnType<typeof saveVideoStream>>;
  try {
    saved = await saveVideoStream(request.body, originalName);
  } catch (reason) {
    if (reason instanceof UploadTooLargeError) return errorResponse("Videos must be smaller than 200 MB.", 413);
    if (reason instanceof UnsupportedVideoError) return errorResponse("Only MP4 and WebM video files are supported.", 415);
    if (reason instanceof DriveError) {
      console.error(reason);
      // Not a 5xx: the dashboard reads those as the server being offline.
      return errorResponse(`The video could not be uploaded to Google Drive. ${reason.message.slice(0, 300)}`, 424);
    }
    throw reason;
  }
  try {
    const image = await prisma.image.create({ data: { originalName, ...saved } });
    return Response.json({ id: image.id, name: image.originalName, url: `/api/admin/images/${image.id}/file` }, { status: 201 });
  } catch (error) {
    await deleteStoredImage(saved.storageKey);
    throw error;
  }
}
