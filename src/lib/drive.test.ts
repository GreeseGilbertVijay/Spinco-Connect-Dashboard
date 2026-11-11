import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { driveFileId, driveFileResponse, driveStorageKey, isDriveConfigured, trashDriveFile, uploadToDrive } from "./drive";

const SESSION_URL = "https://upload.example/session";

function stubDrive(handler: (url: string, init?: RequestInit) => Response | undefined) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("oauth2.googleapis.com")) return Response.json({ access_token: "token", expires_in: 3600 });
    return handler(url, init) ?? new Response(null, { status: 500 });
  }));
  return calls;
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "client");
  vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "secret");
  vi.stubEnv("GOOGLE_DRIVE_REFRESH_TOKEN", "refresh");
  vi.stubEnv("GOOGLE_DRIVE_FOLDER_ID", "folder");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("drive configuration", () => {
  it("needs every setting before Drive is used", () => {
    expect(isDriveConfigured()).toBe(true);
    vi.stubEnv("GOOGLE_DRIVE_REFRESH_TOKEN", "");
    expect(isDriveConfigured()).toBe(false);
  });

  it("tells Drive keys apart from local file names", () => {
    expect(driveFileId(driveStorageKey("abc"))).toBe("abc");
    expect(driveFileId("2d51e6f7-d8b7-4dc6-83ae-9356bdef4e2a.png")).toBeNull();
  });
});

describe("uploadToDrive", () => {
  it("creates the file in the folder under its original name", async () => {
    const calls = stubDrive((url) => {
      if (url.includes("uploadType=resumable")) return new Response(null, { status: 200, headers: { Location: SESSION_URL } });
      if (url === SESSION_URL) return Response.json({ id: "file-1" });
    });
    const id = await uploadToDrive("Summer Sale.mp4", new Blob(["video"], { type: "video/mp4" }));
    expect(id).toBe("file-1");
    const session = calls.find(({ url }) => url.includes("uploadType=resumable"));
    expect(JSON.parse(session?.init?.body as string)).toEqual({ name: "Summer Sale.mp4", parents: ["folder"] });
  });

  it("fails loudly when Drive refuses the upload", async () => {
    stubDrive(() => new Response("quota", { status: 403 }));
    await expect(uploadToDrive("a.png", new Blob(["x"], { type: "image/png" }))).rejects.toThrow("403");
  });
});

describe("driveFileResponse", () => {
  it("passes byte ranges through and keeps the stored media type", async () => {
    const calls = stubDrive(() => new Response("abc", {
      status: 206,
      headers: { "Content-Type": "application/octet-stream", "Content-Length": "3", "Content-Range": "bytes 0-2/10" },
    }));
    const response = await driveFileResponse("file-1", "video/mp4", "no-store", "bytes=0-2");
    expect(new Headers(calls.at(-1)?.init?.headers).get("range")).toBe("bytes=0-2");
    expect(response?.status).toBe(206);
    expect(response?.headers.get("content-type")).toBe("video/mp4");
    expect(response?.headers.get("content-range")).toBe("bytes 0-2/10");
    expect(await response?.text()).toBe("abc");
  });

  it("returns null when the file is gone from Drive", async () => {
    stubDrive(() => new Response(null, { status: 404 }));
    expect(await driveFileResponse("gone", "image/png", "no-store", null)).toBeNull();
  });

  it("throws on other Drive errors", async () => {
    stubDrive(() => new Response("limit", { status: 403 }));
    await expect(driveFileResponse("file-1", "image/png", "no-store", null)).rejects.toThrow("403");
  });
});

describe("trashDriveFile", () => {
  it("moves the file to the bin and ignores one that is already gone", async () => {
    const calls = stubDrive(() => new Response(null, { status: 404 }));
    await trashDriveFile("file-1");
    const call = calls.at(-1);
    expect(call?.init?.method).toBe("PATCH");
    expect(JSON.parse(call?.init?.body as string)).toEqual({ trashed: true });
  });
});
