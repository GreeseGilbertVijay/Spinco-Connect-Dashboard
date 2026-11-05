import { createHash } from "node:crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { assertSameOrigin, errorResponse, getClientIp } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";
import { deviceTokenHash, encryptDeviceToken, newDeviceToken } from "@/lib/security";
import { isPairingExpired } from "@/lib/device-rules";

const pairSchema = z.object({
  code: z.string().regex(/^\d{8}$/),
  name: z.string().trim().min(1).max(60),
});

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  if (!(await requireAdmin())) return errorResponse("Sign in required.", 401);
  if (!(await consumeRateLimit(`admin-pair:${getClientIp(request)}`, 10, 10 * 60_000))) {
    return errorResponse("Too many registration attempts. Try again later.", 429);
  }
  const parsed = pairSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Enter an 8-digit code and a TV name.", 400);
  const codeHash = createHash("sha256").update(parsed.data.code).digest("hex");
  const token = newDeviceToken();

  try {
    const device = await prisma.$transaction(async (transaction) => {
      const pairing = await transaction.pairing.findUnique({ where: { codeHash } });
      if (!pairing || isPairingExpired(pairing.expiresAt)) throw new Error("PAIRING_EXPIRED");
      if (pairing.pairedAt) throw new Error("PAIRING_USED");
      const registered = await transaction.device.create({
        data: {
          name: parsed.data.name,
          tokenHash: deviceTokenHash(token),
        },
        select: { id: true, deviceId: true, name: true },
      });
      await transaction.pairing.update({
        where: { id: pairing.id },
        data: {
          deviceId: registered.id,
          pairedAt: new Date(),
          encryptedToken: encryptDeviceToken(token),
        },
      });
      return registered;
    });
    return Response.json({ device }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "PAIRING_EXPIRED") {
      return errorResponse("That pairing code is invalid or expired. Use the current code on the TV.", 410);
    }
    if (error instanceof Error && error.message === "PAIRING_USED") {
      return errorResponse("That pairing code has already been used.", 409);
    }
    throw error;
  }
}
