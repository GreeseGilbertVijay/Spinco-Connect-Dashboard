import type { Metadata } from "next";
import type { ReactNode } from "react";
import ThemeSync from "@/components/theme-sync";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spinco Connect | Signage Console",
  description: "Manage connected digital signage players and their content.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <body>
        {/* Not in <head>: browser extensions inject scripts there, and React then tries to hydrate theirs as this one. */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
