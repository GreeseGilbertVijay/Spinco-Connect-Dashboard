import { z } from "zod";
import { requireDevice } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const heartbeatSchema = z.object({ appState: z.enum(["foreground", "background"]) });

export async function POST(request: Request) {
  const device = await requireDevice(request);
  if (!device) return errorResponse("Device access is invalid or revoked.", 401);
  const parsed = heartbeatSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Invalid player state.", 400);
  await prisma.device.update({
    where: { id: device.id },
    data: { lastSeenAt: new Date(), appState: parsed.data.appState },
  });
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
