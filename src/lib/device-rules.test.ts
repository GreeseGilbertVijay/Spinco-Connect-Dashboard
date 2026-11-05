import { describe, expect, it } from "vitest";
import { adminName, canReadAssignedImage, deviceScope, isPairingExpired, isPlayerOnline, isSuperAdmin, notRevoked, playlistIds } from "./device-rules";

const now = new Date("2026-10-30T00:00:00.000Z");

describe("pairing expiry", () => {
  it("accepts a code before expiry and rejects it at the expiry instant", () => {
    const expiresAt = new Date(now.getTime() + 10 * 60_000);
    expect(isPairingExpired(expiresAt, now)).toBe(false);
    expect(isPairingExpired(expiresAt, expiresAt)).toBe(true);
  });
});

describe("player connectivity", () => {
  it("uses the server-side 45 second heartbeat threshold", () => {
    expect(isPlayerOnline(new Date(now.getTime() - 44_999), now)).toBe(true);
    expect(isPlayerOnline(new Date(now.getTime() - 45_000), now)).toBe(false);
    expect(isPlayerOnline(null, now)).toBe(false);
  });
});

describe("device image isolation", () => {
  const active = { assignedImageId: "image-a", assignmentVersion: 3, revokedAt: null };

  it("only permits the exact current assignment and version", () => {
    expect(canReadAssignedImage(active, "image-a", 3)).toBe(true);
    expect(canReadAssignedImage(active, "image-b", 3)).toBe(false);
    expect(canReadAssignedImage(active, "image-a", 2)).toBe(false);
    expect(canReadAssignedImage({ ...active, revokedAt: now }, "image-a", 3)).toBe(false);
  });

  it("permits every slide of the current slideshow and nothing else", () => {
    const slideshow = { ...active, slideImageIds: ["image-a", "image-b"] };
    expect(canReadAssignedImage(slideshow, "image-b", 3)).toBe(true);
    expect(canReadAssignedImage(slideshow, "image-c", 3)).toBe(false);
    expect(canReadAssignedImage(slideshow, "image-b", 2)).toBe(false);
    expect(canReadAssignedImage({ ...slideshow, revokedAt: now }, "image-b", 3)).toBe(false);
  });
});

describe("playlist", () => {
  it("falls back to the single assignment for devices without slides", () => {
    expect(playlistIds({ assignedImageId: "image-a", slideImageIds: [] })).toEqual(["image-a"]);
    expect(playlistIds({ assignedImageId: "image-a" })).toEqual(["image-a"]);
    expect(playlistIds({ assignedImageId: null, slideImageIds: [] })).toEqual([]);
  });

  it("keeps the slide order", () => {
    expect(playlistIds({ assignedImageId: "image-b", slideImageIds: ["image-b", "image-a"] })).toEqual(["image-b", "image-a"]);
  });
});

describe("account roles", () => {
  it("only treats the exact role as super admin", () => {
    expect(isSuperAdmin({ role: "super_admin" })).toBe(true);
    expect(isSuperAdmin({ role: "user" })).toBe(false);
    expect(isSuperAdmin({ role: null })).toBe(false);
    expect(isSuperAdmin({})).toBe(false);
  });

  it("limits regular accounts to their own TVs", () => {
    expect(deviceScope({ id: "user-a", role: "user" })).toEqual({ ownerId: "user-a" });
    expect(deviceScope({ id: "user-a" })).toEqual({ ownerId: "user-a" });
    expect(deviceScope({ id: "boss", role: "super_admin" })).toEqual({});
  });

  it("falls back to the email name", () => {
    expect(adminName({ name: "Asha", email: "a@x.com" })).toBe("Asha");
    expect(adminName({ name: null, email: "asha.k@x.com" })).toBe("asha.k");
  });
});

describe("active device filter", () => {
  it("matches devices whose revokedAt was never written to MongoDB", () => {
    expect(notRevoked.OR).toContainEqual({ revokedAt: { isSet: false } });
    expect(notRevoked.OR).toContainEqual({ revokedAt: null });
  });
});
