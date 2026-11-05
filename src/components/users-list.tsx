"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type UserItem = {
  id: string;
  name: string;
  email: string;
  superAdmin: boolean;
  createdAt: string;
  tvCount: number;
  onlineCount: number;
};

const MIN_PASSWORD_LENGTH = 12;

export default function UsersList() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const data = await response.json() as UserItem[] & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Users could not be loaded.");
      setUsers(data);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Users could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const kickoff = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 10_000);
    return () => {
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [refresh]);

  function closeModal() {
    setModal(false);
    setFormError("");
    setName("");
    setEmail("");
    setPassword("");
  }

  async function createUser(event: ChangeEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "The user could not be created.");
      setNotice(`${name.trim()} can now sign in with ${email.trim().toLowerCase()}.`);
      closeModal();
      await refresh();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "The server could not be reached.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div><div className="eyebrow">ACCOUNTS</div><h1>Users</h1><p className="subheading">Create accounts and see the TVs each user has paired.</p></div>
        <button className="button primary" onClick={() => { setNotice(""); setModal(true); }}>＋&nbsp; Create user</button>
      </div>
      {error && <div className="notice error" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      {loading ? <div className="empty-state"><span className="spinner" /></div> : (
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>TVs</th><th>Online</th><th /></tr></thead>
            <tbody>{users.map((user) => (
              <tr key={user.id}>
                <td className="mono">{user.id}</td>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td><span className={`role-tag ${user.superAdmin ? "super" : ""}`}>{user.superAdmin ? "Super admin" : "User"}</span></td>
                <td>{user.tvCount}</td>
                <td>{user.onlineCount}</td>
                <td><Link className="button quiet" href={`/users/${user.id}`}>View TVs</Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}>
        <form className="modal" onSubmit={(event) => void createUser(event)}>
          <h2>Create user</h2><p>Share the email and password with the user. They sign in on the normal login page and only see the TVs they pair.</p>
          {formError && <div className="notice error" role="alert">{formError}</div>}
          <label className="field">Name<input required autoFocus maxLength={60} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="field">Email<input required type="email" autoComplete="off" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="field">Password (at least {MIN_PASSWORD_LENGTH} characters)<input required type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <div className="modal-actions"><button type="button" className="button" onClick={closeModal}>Cancel</button><button type="submit" className="button primary" disabled={busy}>{busy ? "Creating..." : "Create user"}</button></div>
        </form>
      </div>}
    </>
  );
}
