import { randomUUID } from "node:crypto";
import { createReadStream, openAsBlob } from "node:fs";
import { mkdir, open, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import sharp from "sharp";
import { driveFileId, driveFileResponse, driveStorageKey, isDriveConfigured, trashDriveFile, uploadToDrive } from "./drive";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_REQUEST_BYTES = MAX_IMAGE_BYTES + 128 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 80_000_000;
const allowedTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
]);
const videoExtensions = new Map([
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
]);

export function detectImageType(bytes: Uint8Array) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(0, 4)).toString("ascii") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "WEBP") return "image/webp";
  if (bytes.length >= 6) {
    const signature = Buffer.from(bytes.subarray(0, 6)).toString("ascii");
    if (signature === "GIF87a" || signature === "GIF89a") return "image/gif";
  }
  return null;
}

export function detectVideoType(bytes: Uint8Array) {
  if (bytes.length >= 12 && Buffer.from(bytes.subarray(4, 8)).toString("ascii") === "ftyp") {
    return Buffer.from(bytes.subarray(8, 12)).toString("ascii") === "qt  " ? null : "video/mp4";
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";
  return null;
}

function uploadDirectory() {
  const configured = process.env.UPLOADS_DIR;
  return configured
    ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), configured)
    : path.join(process.cwd(), "data", "uploads");
}

function resolveStorageKey(storageKey: string) {
  if (path.basename(storageKey) !== storageKey || storageKey.includes("..") || storageKey.includes("/") || storageKey.includes("\\")) {
    throw new Error("Invalid storage key");
  }
  const directory = uploadDirectory();
  const resolved = path.resolve(/*turbopackIgnore: true*/ directory, storageKey);
  if (path.dirname(resolved) !== directory) throw new Error("Invalid storage path");
  return resolved;
}

export async function saveImage(bytes: Uint8Array, mimeType: string, name: string) {
  const extension = allowedTypes.get(mimeType);
  if (!extension) throw new Error("Unsupported image format");
  if (isDriveConfigured()) return driveStorageKey(await uploadToDrive(name, new Blob([Buffer.from(bytes)], { type: mimeType })));
  const storageKey = `${randomUUID()}${extension}`;
  const directory = uploadDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(resolveStorageKey(storageKey), bytes, { flag: "wx" });
  return storageKey;
}

export function parseByteRange(header: string | null, size: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  return start > end ? "unsatisfiable" : { start, end };
}

// Returns null when the file is missing from disk so callers can answer with a clear 404.
export async function storedFileResponse(storageKey: string, mimeType: string, cacheControl: string, rangeHeader: string | null) {
  const driveId = driveFileId(storageKey);
  if (driveId) return driveFileResponse(driveId, mimeType, cacheControl, rangeHeader);
  const filePath = resolveStorageKey(storageKey);
  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
  const range = parseByteRange(rangeHeader, size);
  if (range === "unsatisfiable") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const stream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(stream, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    },
  });
}

export async function deleteStoredImage(storageKey: string) {
  const driveId = driveFileId(storageKey);
  if (driveId) {
    // The library record is already gone, so a leftover Drive file is only logged.
    await trashDriveFile(driveId).catch((error) => console.error("Could not remove a file from Google Drive", error));
    return;
  }
  try {
    await unlink(resolveStorageKey(storageKey));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
}

export function isAllowedImageType(mimeType: string) {
  return allowedTypes.has(mimeType);
}

export class UploadTooLargeError extends Error {}
export class UnsupportedVideoError extends Error {}

// Videos are streamed to disk so a large upload is never held in memory. With Drive
// configured that file is only a temporary copy, sent on once its format is verified.
export async function saveVideoStream(body: ReadableStream<Uint8Array>, name: string) {
  const directory = uploadDirectory();
  await mkdir(directory, { recursive: true });
  const id = randomUUID();
  const temporaryPath = resolveStorageKey(`${id}.upload`);
  const file = await open(temporaryPath, "wx+");
  let closed = false;
  try {
    const reader = body.getReader();
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_VIDEO_BYTES) {
        await reader.cancel();
        throw new UploadTooLargeError("Video exceeds the maximum size");
      }
      await file.appendFile(value);
    }
    const header = new Uint8Array(12);
    await file.read(header, 0, header.length, 0);
    await file.close();
    closed = true;
    const mimeType = detectVideoType(header);
    const extension = mimeType && videoExtensions.get(mimeType);
    if (!mimeType || !extension) throw new UnsupportedVideoError("Unsupported video format");
    if (isDriveConfigured()) {
      const driveId = await uploadToDrive(name, await openAsBlob(temporaryPath, { type: mimeType }));
      await unlink(temporaryPath).catch(() => undefined);
      return { storageKey: driveStorageKey(driveId), mimeType, size };
    }
    const storageKey = `${id}${extension}`;
    await rename(temporaryPath, resolveStorageKey(storageKey));
    return { storageKey, mimeType, size };
  } catch (error) {
    if (!closed) await file.close();
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

export async function readMultipartForm(request: Request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_REQUEST_BYTES) {
    throw new UploadTooLargeError("Upload request exceeds the maximum size");
  }
  if (!request.body) throw new Error("Upload request has no body");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_REQUEST_BYTES) {
      await reader.cancel();
      throw new UploadTooLargeError("Upload request exceeds the maximum size");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return new Request(request.url, { method: "POST", headers, body: bytes }).formData();
}

export async function verifyImageContents(bytes: Uint8Array, mimeType: string) {
  const image = sharp(bytes, { failOn: "error", limitInputPixels: MAX_IMAGE_PIXELS });
  const metadata = await image.metadata();
  const expectedFormat = mimeType === "image/jpeg" ? "jpeg" : mimeType.slice("image/".length);
  if (
    metadata.format !== expectedFormat ||
    !metadata.width ||
    !metadata.height ||
    metadata.width * metadata.height > MAX_IMAGE_PIXELS
  ) {
    throw new Error("Image content does not match the declared format or exceeds the pixel limit");
  }
}
