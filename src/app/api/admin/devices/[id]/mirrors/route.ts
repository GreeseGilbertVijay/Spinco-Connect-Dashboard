import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { deviceScope, notRevoked, playlistIds } from "@/lib/device-rules";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

const mirrorSchema = z.object({ targetIds: z.array(z.string().min(1)).max(100) });
type RouteContext = { params: Promise<{ id: string }> };

// Replaces the set of TVs following this one. TVs dropped from the set keep their current content.
export async function PUT(request: Request, context: RouteContext) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  const admin = await requireAdmin();
  if (!admin) return errorResponse("Sign in required.", 401);
  const parsed = mirrorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Select the TVs to connect.", 400);
  const { id } = await context.params;
  const targetIds = [...new Set(parsed.data.targetIds)];
  if (targetIds.includes(id)) return errorResponse("A TV cannot follow itself.", 400);

  const source = await prisma.device.findFirst({ where: { id, ...deviceScope(admin), ...notRevoked } });
  if (!source) return errorResponse("TV not found or access has been revoked.", 404);
  if (source.mirrorOfId) return errorResponse("This TV follows another TV. Disconnect it first.", 409);
  const slides = playlistIds(source);
  if (targetIds.length && !slides.length) return errorResponse("Assign content to this TV first.", 400);

  const targets = await prisma.device.findMany({
    where: { id: { in: targetIds }, ...deviceScope(admin), ...notRevoked },
    select: { id: true, mirrorOfId: true },
  });
  if (targets.length !== targetIds.length) return errorResponse("A selected TV was not found or has been revoked.", 404);
  if (targetIds.length && await prisma.device.count({ where: { mirrorOfId: { in: targetIds } } })) {
    return errorResponse("A selected TV has other TVs following it. Disconnect those first.", 409);
  }

  const newTargetIds = targets.filter((target) => target.mirrorOfId !== id).map((target) => target.id);
  await prisma.$transaction([
    prisma.device.updateMany({ where: { mirrorOfId: id, id: { notIn: targetIds } }, data: { mirrorOfId: null } }),
    prisma.device.updateMany({
      where: { id: { in: newTargetIds } },
      data: {
        mirrorOfId: id,
        assignedImageId: slides[0] ?? null,
        slideImageIds: slides,
        slideIntervalSeconds: source.slideIntervalSeconds,
        fit: source.fit,
        assignmentVersion: { increment: 1 },
        lastError: null,
        lastErrorAt: null,
      },
    }),
  ]);
  return Response.json({ ok: true });
}
