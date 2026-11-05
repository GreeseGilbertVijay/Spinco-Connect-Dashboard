import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AdminShell from "@/components/admin-shell";
import { getAdmin } from "@/lib/auth";
import { adminName, isPlayerOnline, isSuperAdmin, playlistIds } from "@/lib/device-rules";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function showing(device: { assignedImageId: string | null; slideImageIds: string[]; assignedImage: { originalName: string } | null }) {
  const count = playlistIds(device).length;
  if (count > 1) return `Slideshow (${count} images)`;
  return device.assignedImage?.originalName ?? "Nothing assigned";
}

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) redirect("/login");
  const { id } = await params;
  const superAdmin = isSuperAdmin(admin);
  if (!superAdmin && admin.id !== id) redirect(`/users/${admin.id}`);
  const user = await prisma.admin.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      devices: { orderBy: { createdAt: "desc" }, include: { assignedImage: { select: { originalName: true } } } },
    },
  });
  if (!user) notFound();
  const now = new Date();
  const tvStatus = (device: { revokedAt: Date | null; lastSeenAt: Date | null }) => {
    if (device.revokedAt) return "Revoked";
    return isPlayerOnline(device.lastSeenAt, now) ? "Online" : "Offline";
  };
  const online = user.devices.filter((device) => tvStatus(device) === "Online").length;

  return (
    <AdminShell email={admin.email} userId={admin.id} superAdmin={superAdmin} caption={adminName(user)}>
      {superAdmin && <Link className="back-link" href="/users">← All users</Link>}
      <div className="page-heading">
        <div>
          <div className="eyebrow">{isSuperAdmin(user) ? "SUPER ADMIN" : "USER"}</div>
          <h1>{adminName(user)}</h1>
          <p className="subheading">{user.email} · ID {user.id}</p>
        </div>
      </div>
      <div className="metric-grid">
        <div className="metric"><div className="metric-label">TVs paired</div><div className="metric-row"><span className="metric-value">{user.devices.length}</span><span className="metric-note">registered by this user</span></div></div>
        <div className="metric"><div className="metric-label">Player connectivity</div><div className="metric-row"><span className="metric-dot" /><span className="metric-value">{online}</span><span className="metric-note">online now</span></div></div>
      </div>
      <section>
        <div className="section-head"><h2>TVs</h2></div>
        {user.devices.length === 0 ? <div className="empty-state"><strong>No TVs paired yet</strong>TVs appear here after this user pairs them.</div> : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Name</th><th>TV ID</th><th>Status</th><th>Showing</th><th>Last seen</th><th>Paired on</th></tr></thead>
              <tbody>{user.devices.map((device) => (
                <tr key={device.id}>
                  <td>{device.name}</td>
                  <td className="mono">{device.deviceId}</td>
                  <td>{tvStatus(device)}</td>
                  <td>{showing(device)}</td>
                  <td>{device.lastSeenAt?.toLocaleString() ?? "Never connected"}</td>
                  <td>{device.createdAt.toLocaleDateString()}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
