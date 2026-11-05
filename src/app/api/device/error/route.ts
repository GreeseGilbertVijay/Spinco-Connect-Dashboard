import { z } from "zod";
import { requireDevice } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const errorSchema = z.object({ message: z.string().trim().min(1).max(300) });

export async function POST(request: Request) {
  const device = await requireDevice(request);
  if (!device) return errorResponse("Device access is invalid or revoked.", 401);
  const parsed = errorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Invalid player error.", 400);
  await prisma.device.update({
    where: { id: device.id },
    data: { lastError: parsed.data.message, lastErrorAt: new Date() },
  });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
