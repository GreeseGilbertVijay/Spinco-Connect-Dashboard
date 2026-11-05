import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_REQUEST_BYTES = MAX_IMAGE_BYTES + 128 * 1024;
const MAX_IMAGE_PIXELS = 80_000_000;
const allowedTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
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

export async function saveImage(bytes: Uint8Array, mimeType: string) {
  const extension = allowedTypes.get(mimeType);
  if (!extension) throw new Error("Unsupported image format");
  const storageKey = `${randomUUID()}${extension}`;
  const directory = uploadDirectory();
  await mkdir(directory, { recursive: true });
  await writeFile(resolveStorageKey(storageKey), bytes, { flag: "wx" });
  return storageKey;
}

export async function readStoredImage(storageKey: string) {
  return readFile(resolveStorageKey(storageKey));
}

export async function deleteStoredImage(storageKey: string) {
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
