"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminShell({ email, userId, superAdmin, caption, children }: {
  email: string;
  userId: string;
  superAdmin: boolean;
  caption: string;
  children: ReactNode;
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><span className="brand-text">SPINCO CONNECT</span></div>
        <div className="side-label">Workspace</div>
        <Link className="nav-item" href="/"><span className="nav-icon">▦</span><span>Overview</span></Link>
        <Link className="nav-item" href="/players"><span className="nav-icon">▣</span><span>Players</span></Link>
        <Link className="nav-item" href="/media"><span className="nav-icon">▧</span><span>Media library</span></Link>
        <Link className="nav-item active" href={superAdmin ? "/users" : `/users/${userId}`}><span className="nav-icon">▤</span><span>{superAdmin ? "Users" : "My TVs"}</span></Link>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-caption">Workspace&nbsp; / &nbsp;<strong>{caption}</strong></div>
          <div className="account"><span>{email}</span><button className="button quiet" onClick={() => void logout()}>Sign out</button><span className="avatar">{email.charAt(0).toUpperCase()}</span></div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
