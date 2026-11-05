import { createHash } from "node:crypto";
import { getClientIp, errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { decryptDeviceToken } from "@/lib/security";
import { isPairingExpired } from "@/lib/device-rules";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code") ?? "";
  if (!/^\d{8}$/.test(code)) return errorResponse("Pairing code not found.", 404);
  const codeHash = createHash("sha256").update(code).digest("hex");
  const ip = getClientIp(request);
  if (!(await consumeRateLimit("pairing-status-global", 3_000, 60_000))) {
    return errorResponse("The pairing service is temporarily busy. Try again shortly.", 429);
  }
  if (!(await consumeRateLimit(`pairing-status-ip:${ip}`, 60, 60_000))) {
    return errorResponse("Too many pairing checks from this network. Try again shortly.", 429);
  }
  if (!(await consumeRateLimit(`pairing-status:${ip}:${codeHash}`, 20, 60_000))) {
    return errorResponse("Too many pairing checks. Try again shortly.", 429);
  }
  const pairing = await prisma.pairing.findUnique({
    where: { codeHash },
    include: { device: true },
  });
  if (!pairing) return errorResponse("Pairing code not found.", 404);
  if (isPairingExpired(pairing.expiresAt)) return errorResponse("Pairing code expired.", 410);
  if (!pairing.device || !pairing.encryptedToken) {
    return Response.json({ paired: false, expiresAt: pairing.expiresAt }, { headers: { "Cache-Control": "no-store" } });
  }
  if (pairing.device.revokedAt) return errorResponse("Device access has been revoked.", 410);
  return Response.json(
    {
      paired: true,
      token: decryptDeviceToken(pairing.encryptedToken),
      deviceId: pairing.device.deviceId,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
