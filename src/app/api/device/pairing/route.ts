import { createHash, randomInt } from "node:crypto";
import { getClientIp, errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!(await consumeRateLimit("pairing-create-global", 120, 60 * 60_000))) {
    return errorResponse("The pairing service is temporarily busy. Try again later.", 429);
  }
  // A TV waiting to be reconnected renews its 10-minute code six times an hour, unattended.
  if (!(await consumeRateLimit(`pairing-create:${getClientIp(request)}`, 30, 60 * 60_000))) {
    return errorResponse("Too many pairing codes requested from this network. Try again later.", 429);
  }
  const code = randomInt(0, 100_000_000).toString().padStart(8, "0");
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  await prisma.pairing.create({
    data: {
      codeHash: createHash("sha256").update(code).digest("hex"),
      expiresAt,
    },
  });
  return Response.json({ code, expiresAt }, { headers: { "Cache-Control": "no-store" } });
}
