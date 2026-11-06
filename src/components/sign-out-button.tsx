"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Could not sign out. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className="sign-out">
      <button type="button" className="button danger" disabled={busy} onClick={() => void signOut()}>{busy ? "Signing out..." : "Sign out"}</button>
      {error && <div className="login-error" role="alert">{error}</div>}
    </div>
  );
}
