"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Live screen sharing from this browser to TVs over WebRTC. The server only relays the
// connection details; the video goes straight from this computer to each TV.

type ShareTv = { id: string; name: string; online: boolean };
type TargetState = "connecting" | "live" | "retrying" | "failed";
type Target = { name: string; state: TargetState; detail?: string };
type Peer = { pc: RTCPeerConnection; sessionId: string | null; timer?: ReturnType<typeof setTimeout>; attempts: number; closed: boolean };

const ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
const ICE_GATHER_TIMEOUT = 3_000;
const ANSWER_POLL_MS = 1_000;
const KEEPALIVE_MS = 5_000;
// Players poll for a share every 2 seconds, so this leaves room for a slow network.
const ANSWER_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;

const STATE_TEXT: Record<TargetState, string> = { connecting: "Connecting...", live: "Live", retrying: "Reconnecting...", failed: "Failed" };

// The whole exchange is one message each way, so every network candidate is gathered first.
function gatheringComplete(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const timer = setTimeout(done, ICE_GATHER_TIMEOUT);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

async function call<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const data = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(data.error ?? "The server refused the request.");
  return data;
}

function endSession(deviceId: string, sessionId: string) {
  // keepalive lets the request finish while the tab is closing.
  void fetch(`/api/admin/devices/${deviceId}/share?session=${sessionId}`, { method: "DELETE", keepalive: true }).catch(() => undefined);
}

export default function ScreenShare({ tvs, disabled }: { tvs: ShareTv[]; disabled: boolean }) {
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [targets, setTargets] = useState<Record<string, Target>>({});
  const [error, setError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef(new Map<string, Peer>());
  const sharing = Object.keys(targets).length > 0;

  const setTarget = useCallback((deviceId: string, update: Partial<Target>) => {
    setTargets((previous) => previous[deviceId] ? { ...previous, [deviceId]: { ...previous[deviceId], ...update } } : previous);
  }, []);

  const closePeer = useCallback((deviceId: string) => {
    const peer = peersRef.current.get(deviceId);
    if (!peer) return;
    peer.closed = true;
    clearTimeout(peer.timer);
    peer.pc.close();
    if (peer.sessionId) endSession(deviceId, peer.sessionId);
    peersRef.current.delete(deviceId);
  }, []);

  const stopAll = useCallback(() => {
    for (const deviceId of [...peersRef.current.keys()]) closePeer(deviceId);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setTargets({});
  }, [closePeer]);

  // A plain function because it calls itself to retry; everything it uses is stable.
  async function connect(deviceId: string, attempts: number) {
    const stream = streamRef.current;
    if (!stream) return;
    closePeer(deviceId);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer: Peer = { pc, sessionId: null, attempts, closed: false };
    peersRef.current.set(deviceId, peer);
    const fail = (detail: string) => {
      if (peer.closed) return;
      if (peer.attempts + 1 < MAX_ATTEMPTS) {
        setTarget(deviceId, { state: "retrying", detail });
        void connect(deviceId, peer.attempts + 1);
      } else {
        closePeer(deviceId);
        setTarget(deviceId, { state: "failed", detail });
      }
    };
    pc.addEventListener("connectionstatechange", () => {
      if (peer.closed) return;
      if (pc.connectionState === "connected") setTarget(deviceId, { state: "live", detail: undefined });
      if (pc.connectionState === "failed") fail("The connection to the TV was lost.");
    });
    try {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      await pc.setLocalDescription(await pc.createOffer());
      await gatheringComplete(pc);
      if (peer.closed || !pc.localDescription) return;
      const { sessionId } = await call<{ sessionId: string }>(`/api/admin/devices/${deviceId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer: pc.localDescription.sdp }),
      });
      if (peer.closed) {
        endSession(deviceId, sessionId);
        return;
      }
      peer.sessionId = sessionId;
      const startedAt = Date.now();
      // Polls for the TV's answer, then keeps the share alive until it is stopped.
      const poll = async () => {
        if (peer.closed) return;
        try {
          const reply = await call<{ state: "waiting" | "answered" | "failed" | "ended"; answer?: string; error?: string }>(
            `/api/admin/devices/${deviceId}/share?session=${sessionId}`,
          );
          if (peer.closed) return;
          // Ended elsewhere, for example by a share started on this TV from another browser.
          if (reply.state === "ended") {
            closePeer(deviceId);
            if (peersRef.current.size === 0) stopAll();
            else setTargets((previous) => Object.fromEntries(Object.entries(previous).filter(([id]) => id !== deviceId)));
            return;
          }
          if (reply.state === "failed") {
            fail(`The TV could not start the share: ${reply.error ?? "unknown error"}`);
            return;
          }
          if (reply.state === "answered" && reply.answer && !pc.remoteDescription) {
            await pc.setRemoteDescription({ type: "answer", sdp: reply.answer });
          }
          if (reply.state === "waiting" && Date.now() - startedAt > ANSWER_TIMEOUT_MS) {
            closePeer(deviceId);
            setTarget(deviceId, { state: "failed", detail: "The TV did not respond. Check that it is online and has the latest Spinco Connect app." });
            return;
          }
        } catch {
          // A missed refresh is harmless; the share only ends after several in a row.
        }
        if (!peer.closed) peer.timer = setTimeout(() => void poll(), pc.remoteDescription ? KEEPALIVE_MS : ANSWER_POLL_MS);
      };
      void poll();
    } catch (reason) {
      fail(reason instanceof Error ? reason.message : "The share could not be started.");
    }
  }

  // Asks the browser which screen, window or tab to share. Returns null when cancelled or unavailable.
  async function captureScreen() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("This browser cannot share the screen here. Use Chrome or Edge, and open the dashboard over HTTPS.");
      return null;
    }
    try {
      return await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30 } }, audio: true });
    } catch (reason) {
      // Choosing Cancel in the browser's picker is not an error.
      if (!(reason instanceof DOMException && reason.name === "NotAllowedError")) {
        setError("The screen could not be captured. Please try again.");
      }
      return null;
    }
  }

  function adoptStream(stream: MediaStream) {
    const previous = streamRef.current;
    if (previous && previous !== stream) {
      previous.getVideoTracks()[0]?.removeEventListener("ended", stopAll);
      previous.getTracks().forEach((track) => track.stop());
    }
    streamRef.current = stream;
    // The browser's own "Stop sharing" button ends the video track.
    stream.getVideoTracks()[0]?.addEventListener("ended", stopAll);
  }

  async function start() {
    const chosen = tvs.filter((tv) => selected.includes(tv.id));
    setPicking(false);
    setError("");
    const stream = await captureScreen();
    if (!stream) return;
    adoptStream(stream);
    setTargets(Object.fromEntries(chosen.map((tv) => [tv.id, { name: tv.name, state: "connecting" as const }])));
    chosen.forEach((tv) => void connect(tv.id, 0));
  }

  // Adds and removes TVs while the share keeps running on the others.
  function applyTvChanges() {
    setPicking(false);
    setError("");
    if (selected.length === 0) {
      stopAll();
      return;
    }
    for (const deviceId of Object.keys(targets)) {
      if (!selected.includes(deviceId)) closePeer(deviceId);
    }
    const next: Record<string, Target> = {};
    for (const deviceId of selected) {
      const existing = targets[deviceId];
      // A TV that already failed gets a fresh try.
      if (existing && existing.state !== "failed") {
        next[deviceId] = existing;
        continue;
      }
      const tv = tvs.find((item) => item.id === deviceId);
      next[deviceId] = { name: tv?.name ?? existing?.name ?? "TV", state: "connecting" };
      void connect(deviceId, 0);
    }
    setTargets(next);
  }

  // Switches to a different screen, window or tab without stopping the share.
  async function changeScreen() {
    setError("");
    const stream = await captureScreen();
    if (!stream) return;
    if (!streamRef.current) {
      // The share ended while the browser picker was open.
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    adoptStream(stream);
    for (const [deviceId, target] of Object.entries(targets)) {
      const peer = peersRef.current.get(deviceId);
      if (!peer || target.state === "failed") {
        setTarget(deviceId, { state: "connecting", detail: undefined });
        void connect(deviceId, 0);
        continue;
      }
      const transceivers = peer.pc.getTransceivers();
      const kinds = new Set(transceivers.map((transceiver) => transceiver.receiver.track.kind));
      // Swapping tracks keeps the TV connected; a new kind (such as audio added) needs a fresh connection.
      if (stream.getTracks().some((track) => !kinds.has(track.kind))) {
        setTarget(deviceId, { state: "connecting", detail: undefined });
        void connect(deviceId, 0);
        continue;
      }
      void Promise.all(transceivers.map((transceiver) => {
        const track = stream.getTracks().find((item) => item.kind === transceiver.receiver.track.kind) ?? null;
        return transceiver.sender.replaceTrack(track);
      })).catch(() => {
        if (peersRef.current.get(deviceId) !== peer) return;
        setTarget(deviceId, { state: "connecting", detail: undefined });
        void connect(deviceId, 0);
      });
    }
  }

  useEffect(() => {
    window.addEventListener("pagehide", stopAll);
    return () => {
      window.removeEventListener("pagehide", stopAll);
      stopAll();
    };
  }, [stopAll]);

  // TVs already in the share stay listed while editing, even if their status lags behind.
  const available = tvs.filter((tv) => tv.online || (sharing && targets[tv.id]));
  const editing = picking && sharing;
  return (
    <>
      <button className="button" disabled={disabled || sharing || available.length === 0} title={available.length ? "Show this computer's screen live on TVs" : "No TV is online"} onClick={() => { setSelected(available.map((tv) => tv.id)); setPicking(true); }}>
        Share screen
      </button>
      {(sharing || error) && createPortal(<div className="share-panel" role="status">
        {sharing && <>
          <div className="share-head"><strong>Sharing your screen</strong><button className="button danger-solid" onClick={stopAll}>Stop sharing</button></div>
          <ul className="share-targets">{Object.entries(targets).map(([deviceId, target]) => (
            <li key={deviceId}>
              <span className={`status ${target.state === "live" ? "online" : ""}`}>{STATE_TEXT[target.state]}</span>
              <span>{target.name}</span>
              {target.detail && <span className="share-detail">{target.detail}</span>}
            </li>
          ))}</ul>
          <div className="share-actions">
            <button className="button" onClick={() => { setSelected(Object.keys(targets)); setPicking(true); }}>Change TVs</button>
            <button className="button" onClick={() => void changeScreen()}>Change screen</button>
          </div>
        </>}
        {error && <span className="share-error">{error}</span>}
        {error && <button className="button quiet" onClick={() => setError("")}>Dismiss</button>}
      </div>, document.body)}
      {picking && createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPicking(false); }}>
        <form className="modal" onSubmit={(event) => { event.preventDefault(); if (editing) applyTvChanges(); else void start(); }}>
          <h2>{editing ? "Change TVs" : "Share screen"}</h2>
          {editing
            ? <p>Tick the TVs that should show your screen. TVs you untick go back to their normal content; the others keep showing the share.</p>
            : <p>Choose the TVs to show this computer&apos;s screen on. Next, your browser asks which screen, window or tab to share. Tick &quot;Share audio&quot; there to play sound on the TVs. The TVs go back to their normal content when you stop.</p>}
          <div className="link-list">{available.map((tv) => (
            <label className="link-option" key={tv.id}>
              <input type="checkbox" checked={selected.includes(tv.id)} onChange={() => setSelected((previous) => previous.includes(tv.id) ? previous.filter((id) => id !== tv.id) : [...previous, tv.id])} />
              <span>{tv.name}</span>
              {editing && targets[tv.id]
                ? <span className={`status ${targets[tv.id].state === "live" ? "online" : ""}`}>{STATE_TEXT[targets[tv.id].state]}</span>
                : <span className="status online">Online</span>}
            </label>
          ))}</div>
          <div className="modal-actions">
            <button type="button" className="button" onClick={() => setPicking(false)}>Cancel</button>
            {editing
              ? <button type="submit" className={`button ${selected.length === 0 ? "danger-solid" : "primary"}`}>{selected.length === 0 ? "Stop sharing" : "Save"}</button>
              : <button type="submit" className="button primary" disabled={selected.length === 0}>Choose screen</button>}
          </div>
        </form>
      </div>, document.body)}
    </>
  );
}
