"use client";

import { ChangeEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

type ImageItem = { id: string; name: string; mimeType: string; size: number; createdAt: string; assignedCount: number; url: string };
type DeviceItem = {
  id: string;
  deviceId: string;
  name: string;
  online: boolean;
  revokedAt: string | null;
  lastSeenAt: string | null;
  appState: string;
  fit: "contain" | "cover";
  assignedImage: { id: string; name: string; url: string } | null;
  lastDisplayed: { name: string; at: string } | null;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(data.error ?? "Request failed. Please try again.");
  return data;
}

function ago(value: string | null) {
  if (!value) return "Never connected";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function Dashboard({ email }: { email: string }) {
  const router = useRouter();
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState(false);
  const [pairCode, setPairCode] = useState("");
  const [deviceName, setDeviceName] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [nextDevices, nextImages] = await Promise.all([
        request<DeviceItem[]>("/api/admin/devices"),
        request<ImageItem[]>("/api/admin/images"),
      ]);
      setDevices(nextDevices);
      setImages(nextImages);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Dashboard data could not be loaded.");
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

  async function action<T>(operation: () => Promise<T>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
      setNotice(success);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function pairDevice(event: ChangeEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{8}$/.test(pairCode)) {
      setError("Enter the 8-digit code shown on the TV.");
      return;
    }
    await action(async () => {
      await request("/api/admin/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pairCode, name: deviceName }),
      });
      setModal(false);
      setPairCode("");
      setDeviceName("");
    }, "TV registered. It will connect automatically.");
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    if (file.size > 10 * 1024 * 1024) {
      setError("Images must be smaller than 10 MB.");
      return;
    }
    const body = new FormData();
    body.set("file", file);
    await action(async () => {
      await request("/api/admin/images", { method: "POST", body });
    }, "Image uploaded to your library.");
  }

  async function logout() {
    await action(async () => {
      await request("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    }, "Signed out.");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">S</span><span className="brand-text">SPINCO CONNECT</span></div>
        <div className="side-label">Workspace</div>
        <button className="nav-item active"><span className="nav-icon">▦</span><span>Overview</span></button>
        <button className="nav-item" onClick={() => document.getElementById("player-list")?.scrollIntoView({ behavior: "smooth" })}><span className="nav-icon">▣</span><span>Players</span></button>
        <button className="nav-item" onClick={() => document.getElementById("library")?.scrollIntoView({ behavior: "smooth" })}><span className="nav-icon">▧</span><span>Image library</span></button>
        <div className="side-foot">Player connectivity is not a physical TV power indicator.<br />Spinco Connect · Local deployment</div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-caption">Workspace&nbsp; / &nbsp;<strong>Overview</strong></div>
          <div className="account"><span>{email}</span><button className="button quiet" onClick={() => void logout()} disabled={busy}>Sign out</button><span className="avatar">{email.charAt(0).toUpperCase()}</span></div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div><div className="eyebrow">SIGNAGE MANAGEMENT</div><h1>Good to see you</h1><p className="subheading">Manage connected players and the content shown on each screen.</p></div>
            <button className="button primary" onClick={() => { setError(""); setModal(true); }}>＋&nbsp; Pair a TV</button>
          </div>
          {error && <div className="notice error" role="alert">{error}</div>}
          {notice && <div className="notice" role="status">{notice}</div>}
          <div className="metric-grid">
            <div className="metric"><div className="metric-label">Registered players</div><div className="metric-row"><span className="metric-value">{loading ? "—" : devices.length}</span><span className="metric-note">all registered screens</span></div></div>
            <div className="metric"><div className="metric-label">Player connectivity</div><div className="metric-row"><span className="metric-dot" /><span className="metric-value">{loading ? "—" : devices.filter((device) => device.online).length}</span><span className="metric-note">online now</span></div></div>
            <div className="metric"><div className="metric-label">Image library</div><div className="metric-row"><span className="metric-value">{loading ? "—" : images.length}</span><span className="metric-note">reusable images</span></div></div>
          </div>

          <section id="player-list">
            <div className="section-head"><h2>Players</h2><span className="section-meta">Connectivity updates every 10 seconds</span></div>
            {loading ? <div className="empty-state"><span className="spinner" /></div> : devices.length === 0 ? (
              <div className="empty-state"><strong>No TVs connected yet</strong>Open the Spinco Connect app on your TV, then pair it using the code on screen.</div>
            ) : (
              <div className="device-grid">{devices.map((device) => (
                <article className="device-card" key={device.id}>
                  <div className="device-top">
                    <div><div className="device-name"><span className={`status ${device.online ? "online" : ""}`}>{device.online ? "Online" : "Offline"}</span><h3>{device.name}</h3></div><div className="device-id">ID&nbsp; {device.deviceId}</div></div>
                    <button className="button quiet" disabled={busy} onClick={() => {
                      const name = window.prompt("Enter a new TV name", device.name);
                      if (name?.trim()) void action(() => request(`/api/admin/devices/${device.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim() }) }), "TV name updated.");
                    }}>Rename</button>
                  </div>
                  <div className="preview-wrap">{device.assignedImage ? <Image src={device.assignedImage.url} alt={`Assigned to ${device.name}`} width={800} height={450} unoptimized /> : <span className="preview-empty">No image assigned</span>}</div>
                  <div className="device-info">
                    <div>Last seen<strong>{ago(device.lastSeenAt)}{device.appState === "background" && device.online ? " · app background" : ""}</strong></div>
                    <div>Last displayed<strong>{device.lastDisplayed?.name ?? "Not acknowledged yet"}</strong></div>
                  </div>
                  <div className="device-controls">
                    <select className="select image-select" aria-label={`Assign image to ${device.name}`} disabled={!!device.revokedAt || busy} value={device.assignedImage?.id ?? ""} onChange={(event) => void action(
                      () => request(`/api/admin/devices/${device.id}/assignment`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageId: event.target.value || null }) }),
                      "Image assignment updated.",
                    )}>
                      <option value="">No image assigned</option>{images.map((image) => <option key={image.id} value={image.id}>{image.name}</option>)}
                    </select>
                    <select className="select" aria-label={`Image fit for ${device.name}`} disabled={!!device.revokedAt || busy} value={device.fit} onChange={(event) => void action(
                      () => request(`/api/admin/devices/${device.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fit: event.target.value }) }),
                      "Image fit updated.",
                    )}><option value="contain">Contain</option><option value="cover">Cover</option></select>
                    {device.revokedAt ? <span className="section-meta">Access revoked</span> : <>
                      <button className="button quiet danger" disabled={busy} onClick={() => {
                        if (window.confirm(`Revoke access for ${device.name}? The player will need to be paired again.`)) void action(() => request(`/api/admin/devices/${device.id}/revoke`, { method: "POST" }), "Device access revoked.");
                      }}>Revoke</button>
                      <button className="button quiet danger" disabled={busy} onClick={() => {
                        if (window.confirm(`Delete ${device.name}? This removes its registration.`)) void action(() => request(`/api/admin/devices/${device.id}`, { method: "DELETE" }), "TV deleted.");
                      }}>Delete</button>
                    </>}
                  </div>
                </article>
              ))}</div>
            )}
          </section>

          <section className="library" id="library">
            <div className="section-head"><div><h2>Image library</h2><span className="section-meta">JPEG, PNG, GIF or WebP · up to 10 MB each</span></div><label className="button" htmlFor="image-upload">＋&nbsp; Upload image</label><input id="image-upload" type="file" accept="image/jpeg,image/png,image/gif,image/webp" hidden onChange={(event) => void uploadImage(event)} /></div>
            {loading ? <div className="empty-state"><span className="spinner" /></div> : images.length === 0 ? <div className="empty-state"><strong>Your image library is empty</strong>Upload an image to assign it to one or more TVs.</div> : (
              <div className="library-grid">{images.map((image) => (
                <article className="image-card" key={image.id}>
                  <div className="image-thumb"><Image src={image.url} alt={image.name} width={800} height={450} unoptimized /></div>
                  <div className="image-details"><div><strong title={image.name}>{image.name}</strong><span>{formatSize(image.size)} · {image.assignedCount} assigned</span></div>
                    <button aria-label={`Delete ${image.name}`} className="button quiet danger" disabled={busy || image.assignedCount > 0} title={image.assignedCount ? "Unassign this image before deleting it" : "Delete image"} onClick={() => {
                      if (window.confirm(`Delete ${image.name} from your library?`)) void action(() => request(`/api/admin/images/${image.id}`, { method: "DELETE" }), "Image deleted.");
                    }}>Delete</button>
                  </div>
                </article>
              ))}</div>
            )}
          </section>
          <p className="section-meta" style={{ marginTop: 32 }}>Online means the player app sent a heartbeat within 45 seconds. It does not confirm the connected television is powered on.</p>
        </div>
      </main>
      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(false); }}>
        <form className="modal" onSubmit={(event) => void pairDevice(event)}>
          <h2>Pair a TV</h2><p>Open Spinco Connect on the TV. Enter the temporary 8-digit code shown on its screen and give the player a recognizable name.</p>
          <label className="field">Pairing code<input inputMode="numeric" autoComplete="off" maxLength={8} required pattern="[0-9]{8}" placeholder="00000000" value={pairCode} onChange={(event) => setPairCode(event.target.value.replace(/\D/g, "").slice(0, 8))} /></label>
          <label className="field">TV name<input required maxLength={60} placeholder="Reception display" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} /></label>
          <div className="modal-actions"><button type="button" className="button" onClick={() => setModal(false)}>Cancel</button><button type="submit" className="button primary" disabled={busy || pairCode.length !== 8 || !deviceName.trim()}>{busy ? "Registering..." : "Register TV"}</button></div>
        </form>
      </div>}
    </div>
  );
}
