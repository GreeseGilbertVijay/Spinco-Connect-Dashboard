// Google Drive storage for uploaded media. Files are read and written as the Google account
// that ran `npm run drive:auth`: service accounts have no storage quota in a personal Drive.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
const DRIVE_KEY_PREFIX = "drive:";
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

export class DriveError extends Error {}

let cachedToken: { value: string; expiresAt: number } | null = null;

const SETTING_NAMES = ["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET", "GOOGLE_DRIVE_REFRESH_TOKEN", "GOOGLE_DRIVE_FOLDER_ID"] as const;

// Hosting panels often keep quotes pasted from a .env file as part of the value.
function setting(name: (typeof SETTING_NAMES)[number]) {
  return process.env[name]?.trim().replace(/^(["'])(.*)\1$/, "$2").trim() || undefined;
}

function credentials() {
  const clientId = setting("GOOGLE_DRIVE_CLIENT_ID");
  const clientSecret = setting("GOOGLE_DRIVE_CLIENT_SECRET");
  const refreshToken = setting("GOOGLE_DRIVE_REFRESH_TOKEN");
  const folderId = setting("GOOGLE_DRIVE_FOLDER_ID");
  return clientId && clientSecret && refreshToken && folderId ? { clientId, clientSecret, refreshToken, folderId } : null;
}

export function isDriveConfigured() {
  return credentials() !== null;
}

// Drive files are recorded in the existing storageKey field, so no database change is needed.
export function driveStorageKey(fileId: string) {
  return `${DRIVE_KEY_PREFIX}${fileId}`;
}

export function driveFileId(storageKey: string) {
  return storageKey.startsWith(DRIVE_KEY_PREFIX) ? storageKey.slice(DRIVE_KEY_PREFIX.length) : null;
}

function requireCredentials() {
  const configured = credentials();
  if (!configured) {
    const missing = SETTING_NAMES.filter((name) => !setting(name));
    throw new DriveError(`Google Drive is not configured on the server. Missing: ${missing.join(", ")}`);
  }
  return configured;
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const { clientId, clientSecret, refreshToken } = requireCredentials();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new DriveError(`Google sign-in failed (${response.status}): ${await response.text()}`);
  const token = await response.json() as { access_token: string; expires_in: number };
  cachedToken = { value: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS };
  return token.access_token;
}

// A resumable session is used for every size so the upload path is the same for images and videos.
export async function uploadToDrive(name: string, file: Blob) {
  const { folderId } = requireCredentials();
  const session = await fetch(`${UPLOAD_URL}?uploadType=resumable&supportsAllDrives=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": file.type,
      "X-Upload-Content-Length": String(file.size),
    },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  const location = session.headers.get("location");
  if (!session.ok || !location) throw new DriveError(`Drive refused the upload (${session.status}): ${await session.text()}`);
  const uploaded = await fetch(location, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!uploaded.ok) throw new DriveError(`Drive upload failed (${uploaded.status}): ${await uploaded.text()}`);
  const { id } = await uploaded.json() as { id: string };
  return id;
}

// Returns null when the file is gone from Drive, matching the local storage contract.
export async function driveFileResponse(fileId: string, mimeType: string, cacheControl: string, rangeHeader: string | null) {
  const upstream = await fetch(`${FILES_URL}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${await accessToken()}`, ...(rangeHeader ? { Range: rangeHeader } : {}) },
  });
  if (upstream.status === 404) return null;
  if (upstream.status === 416) {
    return new Response(null, { status: 416, headers: { "Content-Range": upstream.headers.get("content-range") ?? "bytes */*" } });
  }
  if (!upstream.ok) throw new DriveError(`Drive download failed (${upstream.status}): ${await upstream.text()}`);
  const contentLength = upstream.headers.get("content-length");
  const contentRange = upstream.headers.get("content-range");
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": mimeType,
      "Accept-Ranges": "bytes",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
      ...(contentLength ? { "Content-Length": contentLength } : {}),
      ...(contentRange ? { "Content-Range": contentRange } : {}),
    },
  });
}

// Moved to the Drive bin rather than erased, so a mistaken delete can be recovered for 30 days.
export async function trashDriveFile(fileId: string) {
  const response = await fetch(`${FILES_URL}/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ trashed: true }),
  });
  if (!response.ok && response.status !== 404) throw new DriveError(`Drive delete failed (${response.status}): ${await response.text()}`);
}
