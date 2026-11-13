import { NextResponse, type NextRequest } from "next/server";
import { renewSessionToken, sessionCookieName, sessionCookieOptions } from "@/lib/security";

// Keeps an active admin signed in: a session over a day old gets a fresh week-long token.
// It never signs anyone in or out; pages and API routes still check the session themselves.
export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const token = request.cookies.get(sessionCookieName())?.value;
  if (!token) return response;
  const renewed = await renewSessionToken(token).catch(() => null);
  if (renewed) response.cookies.set(sessionCookieName(), renewed, sessionCookieOptions());
  return response;
}

export const config = {
  // Skips login/logout (they set the cookie themselves), TV player calls (token auth, no cookie) and static files.
  matcher: ["/((?!api/auth|api/device|_next/static|_next/image|favicon.ico|logo.png).*)"],
};
