import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { deviceScope, notRevoked } from "@/lib/device-rules";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { sdpSchema, sessionIdSchema } from "@/lib/screen-share";

type RouteContext = { params: Promise<{ id: string }> };
const offerSchema = z.object({ offer: sdpSchema });

async function findDevice(id: string) {
  const admin = await requireAdmin();
  if (!admin) return { failure: errorResponse("Sign in required.", 401) };
  const device = await prisma.device.findFirst({ where: { id, ...deviceScope(admin), ...notRevoked }, select: { id: true } });
  return device ? { device } : { failure: errorResponse("TV not found or access has been revoked.", 404) };
}

function sessionParameter(request: Request) {
  const parsed = sessionIdSchema.safeParse(new URL(request.url).searchParams.get("session"));
  return parsed.success ? parsed.data : null;
}

// Starts a share, replacing any earlier one on this TV.
export async function POST(request: Request, context: RouteContext) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  const { id } = await context.params;
  const { device, failure } = await findDevice(id);
  if (!device) return failure;
  const parsed = offerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("The screen share could not be prepared. Please try again.", 400);
  const sessionId = randomUUID();
  const fields = { sessionId, offer: parsed.data.offer, answer: null, error: null, aliveAt: new Date() };
  await prisma.screenShare.upsert({ where: { id: device.id }, create: { id: device.id, ...fields }, update: fields });
  return Response.json({ sessionId }, { status: 201 });
}

// Polled by the dashboard: returns the TV's reply and keeps the share alive.
export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const { device, failure } = await findDevice(id);
  if (!device) return failure;
  const sessionId = sessionParameter(request);
  if (!sessionId) return errorResponse("Missing screen share session.", 400);
  const refreshed = await prisma.screenShare.updateMany({ where: { id: device.id, sessionId }, data: { aliveAt: new Date() } });
  const share = refreshed.count ? await prisma.screenShare.findUnique({ where: { id: device.id } }) : null;
  const headers = { "Cache-Control": "no-store" };
  if (!share || share.sessionId !== sessionId) return Response.json({ state: "ended" }, { headers });
  if (share.error) return Response.json({ state: "failed", error: share.error }, { headers });
  return Response.json(share.answer ? { state: "answered", answer: share.answer } : { state: "waiting" }, { headers });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  const { id } = await context.params;
  const { device, failure } = await findDevice(id);
  if (!device) return failure;
  const sessionId = sessionParameter(request);
  if (!sessionId) return errorResponse("Missing screen share session.", 400);
  await prisma.screenShare.deleteMany({ where: { id: device.id, sessionId } });
  return Response.json({ ok: true });
}
