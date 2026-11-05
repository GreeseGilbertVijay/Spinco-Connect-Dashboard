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
  slideImageIds: string[];
  slideIntervalSeconds: number;
  assignedImage: { id: string; name: string; mimeType: string; url: string } | null;
  lastDisplayedImageId: string | null;
  lastDisplayed: { name: string; at: string } | null;
  lastError: string | null;
  lastErrorAt: string | null;
};

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_SLIDES = 20;
const MIN_SLIDE_SECONDS = 3;
const MAX_SLIDE_SECONDS = 900;

function MediaPreview({ item, alt }: { item: { mimeType: string; url: string }; alt: string }) {
  return item.mimeType.startsWith("video/")
    ? <video src={item.url} aria-label={alt} muted playsInline preload="metadata" controls />
    : <Image src={item.url} alt={alt} width={800} height={450} unoptimized />;
}

function deviceStatus(device: DeviceItem, actionError?: string) {
  if (actionError) return { tone: "error", text: actionError };
  if (device.revokedAt) return { tone: "error", text: "Access revoked. The TV has cleared its content and shows a code to reconnect." };
  if (device.lastError) return { tone: "error", text: `TV error${device.lastErrorAt ? ` (${ago(device.lastErrorAt)})` : ""}: ${device.lastError}` };
  if (!device.assignedImage || (device.lastDisplayedImageId && device.slideImageIds.includes(device.lastDisplayedImageId))) return null;
  return device.online
    ? { tone: "pending", text: `Sending ${device.slideImageIds.length > 1 ? "the slideshow" : device.assignedImage.name} to the TV...` }
    : { tone: "error", text: "This TV is offline. The content will appear when it reconnects." };
}

// The backend is down or unreachable, as opposed to refusing one particular request.
class ConnectionError extends Error {}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" }).catch(() => {
    throw new ConnectionError("The server could not be reached.");
  });
  const data = await response.json().catch(() => ({})) as { error?: string } & T;
  if (response.status >= 500) throw new ConnectionError(data.error ?? "The server is not responding.");
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

type ConfirmDialog = { title: string; message: string; confirmLabel: string; danger?: boolean; run: () => void };

export default function Dashboard({ email }: { email: string }) {
  const router = useRouter();
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deviceErrors, setDeviceErrors] = useState<Record<string, string>>({});
  const [modal, setModal] = useState(false);
  const [pairCode, setPairCode] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [reconnecting, setReconnecting] = useState<DeviceItem | null>(null);
  const [slideshowDevice, setSlideshowDevice] = useState<DeviceItem | null>(null);
  const [slideIds, setSlideIds] = useState<string[]>([]);
  const [slideSeconds, setSlideSeconds] = useState(10);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const [renaming, setRenaming] = useState<DeviceItem | null>(null);
  const [newName, setNewName] = useState("");
  const [serverOffline, setServerOffline] = useState(false);
  const [serverPopup, setServerPopup] = useState(false);
  const [serverRetrying, setServerRetrying] = useState(false);
  const [serverRetryFailed, setServerRetryFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextDevices, nextImages] = await Promise.all([
        request<DeviceItem[]>("/api/admin/devices"),
        request<ImageItem[]>("/api/admin/images"),
      ]);
      setDevices(nextDevices);
      setImages(nextImages);
      setError("");
      setServerOffline(false);
      setServerPopup(false);
      return true;
    } catch (reason) {
      if (reason instanceof ConnectionError) setServerOffline(true);
      else setError(reason instanceof Error ? reason.message : "Dashboard data could not be loaded.");
      return false;
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

  async function action<T>(operation: () => Promise<T>, success: string, deviceId?: string) {
    setBusy(true);
    setError("");
    setNotice("");
    if (deviceId) setDeviceErrors((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== deviceId)));
    try {
      await operation();
      setNotice(success);
      await refresh();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "The action could not be completed.";
      if (reason instanceof ConnectionError) setServerOffline(true);
      if (deviceId) setDeviceErrors((previous) => ({ ...previous, [deviceId]: message }));
      else setError(message);
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
        body: JSON.stringify({ code: pairCode, name: deviceName, deviceId: reconnecting?.id }),
      });
      closePairing();
    }, reconnecting ? "TV reconnected. Its content will return automatically." : "TV registered. It will connect automatically.");
  }

  async function reconnectServer() {
    setServerRetrying(true);
    setServerRetryFailed(false);
    const connected = await refresh();
    setServerRetrying(false);
    setServerRetryFailed(!connected);
  }

  async function saveName(event: ChangeEvent<HTMLFormElement>) {
    event.preventDefault();
    const device = renaming;
    if (!device) return;
    setRenaming(null);
    await action(
      () => request(`/api/admin/devices/${device.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim() }) }),
      "TV name updated.",
      device.id,
    );
  }

  function closePairing() {
    setModal(false);
    setReconnecting(null);
    setPairCode("");
    setDeviceName("");
  }

  function openReconnect(device: DeviceItem) {
    setError("");
    setReconnecting(device);
    setDeviceName(device.name);
    setModal(true);
  }

  function openSlideshow(device: DeviceItem) {
    setError("");
    setSlideshowDevice(device);
    setSlideIds(device.slideImageIds.filter((id) => images.some((image) => image.id === id && image.mimeType.startsWith("image/"))));
    setSlideSeconds(device.slideIntervalSeconds);
  }

  async function saveSlideshow(event: ChangeEvent<HTMLFormElement>) {
    event.preventDefault();
    const device = slideshowDevice;
    if (!device) return;
    setSlideshowDevice(null);
    await action(
      () => request(`/api/admin/devices/${device.id}/assignment`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageIds: slideIds, slideIntervalSeconds: slideSeconds }) }),
      "Slideshow updated.",
      device.id,
    );
  }

  async function uploadMedia(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = "";
    if (file.type.startsWith("video/")) {
      if (file.size > MAX_VIDEO_BYTES) {
        setError("Videos must be smaller than 200 MB.");
        return;
      }
      await action(async () => {
        await request("/api/admin/videos", { method: "POST", headers: { "Content-Type": file.type, "X-File-Name": encodeURIComponent(file.name) }, body: file });
      }, "Video uploaded to your library.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
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
        <button className="nav-item" onClick={() => document.getElementById("library")?.scrollIntoView({ behavior: "smooth" })}><span className="nav-icon">▧</span><span>Media library</span></button>
        <div className="side-foot">Player connectivity is not a physical TV power indicator.<br />Spinco Connect · Local deployment</div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div className="topbar-caption">Workspace&nbsp; / &nbsp;<strong>Overview</strong></div>
          <div className="account"><span>{email}</span><button className="button quiet" onClick={() => void logout()} disabled={busy}>Sign out</button><span className="avatar">{email.charAt(0).toUpperCase()}</span>{serverOffline && <button className="server-dot" aria-label="Server offline. Open reconnect options" title="Server offline" onClick={() => { setServerRetryFailed(false); setServerPopup(true); }} />}</div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div><div className="eyebrow">SIGNAGE MANAGEMENT</div><h1>Good to see you</h1><p className="subheading">Manage connected players and the content shown on each screen.</p></div>
            <button className="button primary" onClick={() => { setError(""); setReconnecting(null); setModal(true); }}>＋&nbsp; Pair a TV</button>
          </div>
          {error && <div className="notice error" role="alert">{error}</div>}
          {notice && <div className="notice" role="status">{notice}</div>}
          <div className="metric-grid">
            <div className="metric"><div className="metric-label">Registered players</div><div className="metric-row"><span className="metric-value">{loading ? "—" : devices.length}</span><span className="metric-note">all registered screens</span></div></div>
            <div className="metric"><div className="metric-label">Player connectivity</div><div className="metric-row"><span className="metric-dot" /><span className="metric-value">{loading ? "—" : devices.filter((device) => device.online).length}</span><span className="metric-note">online now</span></div></div>
            <div className="metric"><div className="metric-label">Media library</div><div className="metric-row"><span className="metric-value">{loading ? "—" : images.length}</span><span className="metric-note">reusable files</span></div></div>
          </div>

          <section id="player-list">
            <div className="section-head"><h2>Players</h2><span className="section-meta">Connectivity updates every 10 seconds</span></div>
            {loading ? <div className="empty-state"><span className="spinner" /></div> : devices.length === 0 ? (
              <div className="empty-state"><strong>No TVs connected yet</strong>Open the Spinco Connect app on your TV, then pair it using the code on screen.</div>
            ) : (
              <div className="device-grid">{devices.map((device) => {
                const status = deviceStatus(device, deviceErrors[device.id]);
                return (
                <article className="device-card" key={device.id}>
                  <div className="device-top">
                    <div><div className="device-name"><span className={`status ${device.online ? "online" : ""}`}>{device.online ? "Online" : "Offline"}</span><h3>{device.name}</h3></div><div className="device-id">ID&nbsp; {device.deviceId}</div></div>
                    <button className="button quiet" disabled={busy || !!device.revokedAt} onClick={() => { setNewName(device.name); setRenaming(device); }}>Rename</button>
                  </div>
                  <div className="preview-wrap">
                    {device.revokedAt ? <span className="preview-empty">Access revoked · nothing is showing on this TV</span> : device.assignedImage ? <MediaPreview item={device.assignedImage} alt={`Assigned to ${device.name}`} /> : <span className="preview-empty">Nothing assigned</span>}
                    {!device.revokedAt && device.slideImageIds.length > 1 && <span className="preview-badge">Slideshow · {device.slideImageIds.length} images · {device.slideIntervalSeconds}s each</span>}
                  </div>
                  <div className="device-info">
                    <div>Last seen<strong>{ago(device.lastSeenAt)}{device.appState === "background" && device.online ? " · app background" : ""}</strong></div>
                    <div>Last displayed<strong>{device.lastDisplayed?.name ?? "Not acknowledged yet"}</strong></div>
                  </div>
                  <div className="device-controls">
                    <select className="select image-select" aria-label={`Assign content to ${device.name}`} disabled={!!device.revokedAt || busy} value={device.slideImageIds.length > 1 ? "slideshow" : device.assignedImage?.id ?? ""} onChange={(event) => void action(
                      () => request(`/api/admin/devices/${device.id}/assignment`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageIds: event.target.value ? [event.target.value] : [] }) }),
                      "Assignment updated.",
                      device.id,
                    )}>
                      <option value="">Nothing assigned</option>{device.slideImageIds.length > 1 && <option value="slideshow" disabled>Slideshow ({device.slideImageIds.length} images)</option>}{images.map((image) => <option key={image.id} value={image.id}>{image.name}</option>)}
                    </select>
                    <select className="select" aria-label={`Content fit for ${device.name}`} disabled={!!device.revokedAt || busy} value={device.fit} onChange={(event) => void action(
                      () => request(`/api/admin/devices/${device.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fit: event.target.value }) }),
                      "Fit updated.",
                      device.id,
                    )}><option value="contain">Contain</option><option value="cover">Cover</option></select>
                    <button className="button quiet" disabled={!!device.revokedAt || busy || images.filter((image) => image.mimeType.startsWith("image/")).length < 2} title="Rotate several images on this TV" onClick={() => openSlideshow(device)}>Slideshow</button>
                    {device.revokedAt
                      ? <button className="button primary" disabled={busy} onClick={() => openReconnect(device)}>Reconnect</button>
                      : <button className="button quiet danger" disabled={busy} onClick={() => setConfirmDialog({
                        title: `Revoke ${device.name}?`,
                        message: "The TV clears its content straight away and shows a code. You can reconnect it with that code later.",
                        confirmLabel: "Revoke access",
                        danger: true,
                        run: () => void action(() => request(`/api/admin/devices/${device.id}/revoke`, { method: "POST" }), "Device access revoked.", device.id),
                      })}>Revoke</button>}
                    <button className="button quiet danger" disabled={busy} onClick={() => setConfirmDialog({
                      title: `Delete ${device.name}?`,
                      message: "This removes its registration and settings. The TV will have to be paired as a new TV.",
                      confirmLabel: "Delete TV",
                      danger: true,
                      run: () => void action(() => request(`/api/admin/devices/${device.id}`, { method: "DELETE" }), "TV deleted.", device.id),
                    })}>Delete</button>
                  </div>
                  {status && <div className={`device-status ${status.tone}`} role={status.tone === "error" ? "alert" : "status"}>{status.text}</div>}
                </article>
                );
              })}</div>
            )}
          </section>

          <section className="library" id="library">
            <div className="section-head"><div><h2>Media library</h2><span className="section-meta">Images: JPEG, PNG, GIF or WebP up to 10 MB · Videos: MP4 or WebM up to 200 MB</span></div><label className="button" htmlFor="media-upload">＋&nbsp; Upload media</label><input id="media-upload" type="file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm" hidden disabled={busy} onChange={(event) => void uploadMedia(event)} /></div>
            {loading ? <div className="empty-state"><span className="spinner" /></div> : images.length === 0 ? <div className="empty-state"><strong>Your media library is empty</strong>Upload an image or video to assign it to one or more TVs.</div> : (
              <div className="library-grid">{images.map((image) => (
                <article className="image-card" key={image.id}>
                  <div className="image-thumb"><MediaPreview item={image} alt={image.name} /></div>
                  <div className="image-details"><div><strong title={image.name}>{image.name}</strong><span>{formatSize(image.size)} · {image.assignedCount} assigned</span></div>
                    <button aria-label={`Delete ${image.name}`} className="button quiet danger" disabled={busy || image.assignedCount > 0} title={image.assignedCount ? "Unassign this file before deleting it" : "Delete file"} onClick={() => setConfirmDialog({
                      title: `Delete ${image.name}?`,
                      message: "This permanently removes the file from your media library.",
                      confirmLabel: "Delete file",
                      danger: true,
                      run: () => void action(() => request(`/api/admin/images/${image.id}`, { method: "DELETE" }), "File deleted."),
                    })}>Delete</button>
                  </div>
                </article>
              ))}</div>
            )}
          </section>
          <p className="section-meta" style={{ marginTop: 32 }}>Online means the player app sent a heartbeat within 45 seconds. It does not confirm the connected television is powered on.</p>
        </div>
      </main>
      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closePairing(); }}>
        <form className="modal" onSubmit={(event) => void pairDevice(event)}>
          <h2>{reconnecting ? `Reconnect ${reconnecting.name}` : "Pair a TV"}</h2><p>{reconnecting ? "Enter the 8-digit code now showing on this TV. It keeps its assigned content and settings." : "Open Spinco Connect on the TV. Enter the temporary 8-digit code shown on its screen and give the player a recognizable name."}</p>
          <label className="field">Pairing code<input inputMode="numeric" autoComplete="off" maxLength={8} required pattern="[0-9]{8}" placeholder="00000000" value={pairCode} onChange={(event) => setPairCode(event.target.value.replace(/\D/g, "").slice(0, 8))} /></label>
          <label className="field">TV name<input required maxLength={60} placeholder="Reception display" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} /></label>
          <div className="modal-actions"><button type="button" className="button" onClick={closePairing}>Cancel</button><button type="submit" className="button primary" disabled={busy || pairCode.length !== 8 || !deviceName.trim()}>{busy ? "Connecting..." : reconnecting ? "Reconnect TV" : "Register TV"}</button></div>
        </form>
      </div>}
      {confirmDialog && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmDialog(null); }}>
        <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
          <h2 id="confirm-title">{confirmDialog.title}</h2><p>{confirmDialog.message}</p>
          <div className="modal-actions"><button type="button" className="button" autoFocus onClick={() => setConfirmDialog(null)}>Cancel</button><button type="button" className={`button ${confirmDialog.danger ? "danger-solid" : "primary"}`} onClick={() => { confirmDialog.run(); setConfirmDialog(null); }}>{confirmDialog.confirmLabel}</button></div>
        </div>
      </div>}
      {renaming && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenaming(null); }}>
        <form className="modal" onSubmit={(event) => void saveName(event)}>
          <h2>Rename {renaming.name}</h2>
          <label className="field">TV name<input required autoFocus maxLength={60} value={newName} onChange={(event) => setNewName(event.target.value)} /></label>
          <div className="modal-actions"><button type="button" className="button" onClick={() => setRenaming(null)}>Cancel</button><button type="submit" className="button primary" disabled={busy || !newName.trim()}>Save name</button></div>
        </form>
      </div>}
      {serverPopup && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setServerPopup(false); }}>
        <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="server-title">
          <h2 id="server-title">Server offline</h2><p>{serverRetryFailed ? "Still unable to reach the server. Check that the backend is running and this computer is on the network." : "The dashboard cannot reach the server. The information on this page may be out of date, and changes will not be saved."}</p>
          <div className="modal-actions"><button type="button" className="button" onClick={() => setServerPopup(false)}>Close</button><button type="button" className="button primary" autoFocus disabled={serverRetrying} onClick={() => void reconnectServer()}>{serverRetrying ? "Reconnecting..." : "Reconnect"}</button></div>
        </div>
      </div>}
      {slideshowDevice && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSlideshowDevice(null); }}>
        <form className="modal wide" onSubmit={(event) => void saveSlideshow(event)}>
          <h2>Slideshow for {slideshowDevice.name}</h2><p>Tick at least two images. They play in the order you tick them, then repeat.</p>
          <div className="slide-picker">{images.filter((image) => image.mimeType.startsWith("image/")).map((image) => {
            const position = slideIds.indexOf(image.id);
            return (
              <label className={`slide-option ${position >= 0 ? "selected" : ""}`} key={image.id} title={image.name}>
                <input type="checkbox" checked={position >= 0} disabled={position < 0 && slideIds.length >= MAX_SLIDES} onChange={() => setSlideIds((previous) => previous.includes(image.id) ? previous.filter((id) => id !== image.id) : [...previous, image.id])} />
                <Image src={image.url} alt="" width={160} height={90} unoptimized />
                <span className="slide-name">{image.name}</span>
                {position >= 0 && <span className="slide-order">{position + 1}</span>}
              </label>
            );
          })}</div>
          <label className="field">Seconds per image<input type="number" required min={MIN_SLIDE_SECONDS} max={MAX_SLIDE_SECONDS} step={1} value={slideSeconds} onChange={(event) => setSlideSeconds(Number(event.target.value))} /></label>
          <div className="modal-actions"><button type="button" className="button" onClick={() => setSlideshowDevice(null)}>Cancel</button><button type="submit" className="button primary" disabled={busy || slideIds.length < 2}>Save slideshow</button></div>
        </form>
      </div>}
    </div>
  );
}
