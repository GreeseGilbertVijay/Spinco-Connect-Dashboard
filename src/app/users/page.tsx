import { redirect } from "next/navigation";
import AdminShell from "@/components/admin-shell";
import UsersList from "@/components/users-list";
import { getAdmin } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/device-rules";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  if (!isSuperAdmin(admin)) redirect(`/users/${admin.id}`);
  return (
    <AdminShell email={admin.email} userId={admin.id} superAdmin caption="Users">
      <UsersList />
    </AdminShell>
  );
}
