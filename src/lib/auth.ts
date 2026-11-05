import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { deviceTokenHash, sessionCookieName, verifySessionToken } from "@/lib/security";

export async function getAdmin() {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;
  const session = await verifySessionToken(token);
  if (!session) return null;
  return prisma.admin.findUnique({ where: { id: session.id } });
}

export async function requireAdmin() {
  return getAdmin();
}

export async function requireDevice(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token || token.length > 200) return null;
  const device = await prisma.device.findUnique({
    where: { tokenHash: deviceTokenHash(token) },
  });
  return device && !device.revokedAt ? device : null;
}
