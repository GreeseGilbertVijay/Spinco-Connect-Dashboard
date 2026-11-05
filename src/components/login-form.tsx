"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? `Server error (${response.status}). Please try again later.`);
      router.replace("/");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-box" onSubmit={submit}>
        <div className="brand"><Image className="brand-mark" src="/logo.png" alt="Spinco logo" width={40} height={40} loading="eager" /><span className="brand-text">SPINCO CONNECT</span></div>
        <h1>Welcome back</h1>
        <p className="subheading">Sign in to manage your signage players and screen content.</p>
        <label className="field">Email address<input autoComplete="username" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="field">Password<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <div className="login-error" role="alert">{error}</div>}
        <button className="button primary" disabled={loading} type="submit">{loading ? "Signing in..." : "Sign in"}</button>
      </form>
    </main>
  );
}
