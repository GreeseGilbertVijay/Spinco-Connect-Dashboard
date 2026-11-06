import type { ReactNode } from "react";
import AccountLink from "@/components/account-link";
import AppSidebar, { type SidebarSection } from "@/components/app-sidebar";

export default function AdminShell({ email, userId, superAdmin, caption, section = "users", children }: {
  email: string;
  userId: string;
  superAdmin: boolean;
  caption: string;
  section?: SidebarSection;
  children: ReactNode;
}) {
  return (
    <div className="app-shell">
      <AppSidebar active={section} userId={userId} superAdmin={superAdmin} />
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-caption">Workspace&nbsp; / &nbsp;<strong>{caption}</strong></div>
          <div className="account"><AccountLink email={email} /></div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
