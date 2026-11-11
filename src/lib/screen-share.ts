import { z } from "zod";

// The dashboard refreshes a share every few seconds; one it stops refreshing, for example
// because the browser tab closed, is over for the TV once this much time has passed.
export const SHARE_STALE_MS = 20_000;

export function isShareAlive(aliveAt: Date, now = new Date()) {
  return now.getTime() - aliveAt.getTime() < SHARE_STALE_MS;
}

// Session descriptions carry every network candidate, which keeps the exchange to one
// message each way. Real ones are a few kilobytes.
export const sdpSchema = z.string().min(10).max(100_000).startsWith("v=0");
export const sessionIdSchema = z.uuid();
