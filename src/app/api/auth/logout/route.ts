import { cookies } from "next/headers";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { sessionCookieName, sessionCookieOptions } from "@/lib/security";

export async function POST(request: Request) {
  if (!assertSameOrigin(request)) return errorResponse("Invalid request origin.", 403);
  (await cookies()).set(sessionCookieName(), "", { ...sessionCookieOptions(), maxAge: 0 });
  return Response.json({ ok: true });
}
