import { redirect } from "next/navigation";
import Dashboard, { type DashboardView } from "@/components/dashboard";
import { getAdmin } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/device-rules";

export default async function DashboardPage({ view }: { view: DashboardView }) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  return <Dashboard email={admin.email} userId={admin.id} superAdmin={isSuperAdmin(admin)} view={view} />;
}
