import Image from "next/image";
import Link from "next/link";

export type SidebarSection = "overview" | "players" | "media" | "users" | "profile";

export default function AppSidebar({ active, userId, superAdmin }: { active: SidebarSection; userId: string; superAdmin: boolean }) {
  const item = (section: SidebarSection, href: string, icon: string, label: string) => (
    <Link className={`nav-item ${active === section ? "active" : ""}`} href={href}><span className="nav-icon">{icon}</span><span>{label}</span></Link>
  );
  return (
    <aside className="sidebar">
      <div className="brand"><Image className="brand-mark" src="/logo.png" alt="Spinco logo" width={40} height={40} loading="eager" /><span className="brand-text">SPINCO CONNECT</span></div>
      <div className="side-label">Workspace</div>
      {item("overview", "/", "▦", "Overview")}
      {item("players", "/players", "▣", "Players")}
      {item("media", "/media", "▧", "Media library")}
      {item("users", superAdmin ? "/users" : `/users/${userId}`, "▤", superAdmin ? "Users" : "My TVs")}
      <div className="side-label account-label">Account</div>
      {item("profile", "/profile", "◉", "My profile")}
      <div className="side-foot">Player connectivity is not a physical TV power indicator.<br />Spinco Connect · Local deployment</div>
    </aside>
  );
}
