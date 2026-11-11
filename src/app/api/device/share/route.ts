import { z } from "zod";
import { requireDevice } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { isShareAlive, sdpSchema, sessionIdSchema } from "@/lib/screen-share";

const replySchema = z.union([
  z.object({ sessionId: sessionIdSchema, answer: sdpSchema }),
  z.object({ sessionId: sessionIdSchema, error: z.string().min(1).max(300) }),
]);

// Polled by the TV every few seconds. The offer is only sent until the TV has answered it.
export async function GET(request: Request) {
  const device = await requireDevice(request);
  if (!device) return errorResponse("Device access is invalid or revoked.", 401);
  const share = await prisma.screenShare.findUnique({ where: { id: device.id } });
  const live = share && !share.error && isShareAlive(share.aliveAt);
  return Response.json(
    { session: live ? { id: share.sessionId, ...(share.answer ? {} : { offer: share.offer }) } : null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const device = await requireDevice(request);
  if (!device) return errorResponse("Device access is invalid or revoked.", 401);
  const parsed = replySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Invalid screen share reply.", 400);
  const { sessionId, ...reply } = parsed.data;
  const updated = await prisma.screenShare.updateMany({ where: { id: device.id, sessionId }, data: reply });
  if (!updated.count) return errorResponse("This screen share has ended.", 404);
  return Response.json({ ok: true });
}
