import { beforeEach, describe, expect, it } from "vitest";
import {
  createSessionToken,
  decryptDeviceToken,
  deviceTokenHash,
  encryptDeviceToken,
  newDeviceToken,
  renewSessionToken,
  safeStringEqual,
  sessionCookieOptions,
  verifySessionToken,
} from "./security";

beforeEach(() => {
  process.env.SESSION_SECRET = "test-only-session-secret-that-is-at-least-32-characters";
  process.env.DEVICE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("admin session authentication", () => {
  it("verifies signed sessions and rejects a tampered token", async () => {
    const token = await createSessionToken("admin-id", "admin@example.test");
    expect(await verifySessionToken(token)).toEqual({ id: "admin-id", email: "admin@example.test" });
    expect(await verifySessionToken(`${token}x`)).toBeNull();
  });

  it("renews a session only once it is a day old, keeping the same admin", async () => {
    const token = await createSessionToken("admin-id", "admin@example.test");
    expect(await renewSessionToken(token)).toBeNull();
    const renewed = await renewSessionToken(token, Date.now() + 25 * 60 * 60 * 1000);
    expect(renewed).toEqual(expect.any(String));
    expect(await verifySessionToken(renewed!)).toEqual({ id: "admin-id", email: "admin@example.test" });
    expect(await renewSessionToken(`${token}x`, Date.now() + 25 * 60 * 60 * 1000)).toBeNull();
  });

  it("keeps the session cookie on links from other sites and for a week", () => {
    expect(sessionCookieOptions()).toMatchObject({ httpOnly: true, sameSite: "lax", maxAge: 7 * 24 * 60 * 60 });
  });
});

describe("device token protection", () => {
  it("creates opaque tokens, hashes them, and encrypts pairing hand-off", () => {
    const token = newDeviceToken();
    expect(token).toHaveLength(43);
    expect(deviceTokenHash(token)).not.toBe(token);
    expect(safeStringEqual(deviceTokenHash(token), deviceTokenHash(token))).toBe(true);
    expect(safeStringEqual(deviceTokenHash(token), deviceTokenHash("different"))).toBe(false);
    expect(decryptDeviceToken(encryptDeviceToken(token))).toBe(token);
  });
});
