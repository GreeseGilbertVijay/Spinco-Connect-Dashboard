import { getAdmin } from "@/lib/auth";
import { errorResponse } from "@/lib/http";

export async function GET() {
  const admin = await getAdmin();
  if (!admin) return errorResponse("Sign in required.", 401);
  return Response.json({ email: admin.email }, { headers: { "Cache-Control": "no-store" } });
}
