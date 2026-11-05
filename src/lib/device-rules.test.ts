import { describe, expect, it } from "vitest";
import { canReadAssignedImage, isPairingExpired, isPlayerOnline, notRevoked } from "./device-rules";

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
});

describe("active device filter", () => {
  it("matches devices whose revokedAt was never written to MongoDB", () => {
    expect(notRevoked.OR).toContainEqual({ revokedAt: { isSet: false } });
    expect(notRevoked.OR).toContainEqual({ revokedAt: null });
  });
});
