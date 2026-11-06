import type { Metadata } from "next";
import { redirect } from "next/navigation";
import AdminShell from "@/components/admin-shell";
import ProfileView from "@/components/profile-view";
import { getAdmin } from "@/lib/auth";
import { adminName, deviceScope, isPlayerOnline, isSuperAdmin } from "@/lib/device-rules";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "My profile | Spinco Connect" };

export default async function ProfilePage() {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const superAdmin = isSuperAdmin(admin);
  const devices = await prisma.device.findMany({
    where: deviceScope(admin),
    select: { lastSeenAt: true, revokedAt: true },
  });
  const now = new Date();
  return (
    <AdminShell email={admin.email} userId={admin.id} superAdmin={superAdmin} caption="My profile" section="profile">
      <ProfileView profile={{
        id: admin.id,
        name: adminName(admin),
        email: admin.email,
        superAdmin,
        memberSince: admin.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
        tvCount: devices.length,
        liveCount: devices.filter((device) => !device.revokedAt && isPlayerOnline(device.lastSeenAt, now)).length,
        tvsHref: superAdmin ? "/players" : `/users/${admin.id}`,
      }} />
    </AdminShell>
  );
}
