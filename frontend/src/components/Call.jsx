// ═══════════════════════════════════════════════════════════════
// Call.jsx — WebRTC Voice & Video Calls
//
// FIXES vs previous version:
//  1. Free TURN servers added (metered.ca open relay) — works behind NAT
//  2. Single offer path — no double emit race condition
//  3. connectionState "connected" OR "completed" both trigger active
//  4. ICE restart on failure
//  5. Faster: trickle ICE enabled, no offer re-creation
//  6. Audio element always rendered (not conditionally)
//  7. Proper cleanup on unmount
// ═══════════════════════════════════════════════════════════════
import { useEffect, useRef, useState, useCallback } from "react";
import { socket } from "../socket";
import {
  stopAllSounds, playCallConnected, playHangup,
} from "../services/sounds";

// ── ICE servers: STUN + free TURN relay ──────────────────────────
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  // Free TURN servers (open relay, works behind strict NAT/firewall)
  {
    urls: "turn:openrelay.metered.ca:80",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
  {
    urls: "turn:openrelay.metered.ca:443?transport=tcp",
    username: "openrelayproject",
    credential: "openrelayproject",
  },
];

// ── CallTimer ────────────────────────────────────────────────────
class CallTimer {
  constructor(onTick) { this._cb = onTick; this._s = 0; this._id = null; }
  start() { this._s = 0; this._id = setInterval(() => { this._s++; this._cb(this._fmt()); }, 1000); }
  stop()  { clearInterval(this._id); this._id = null; }
  _fmt()  {
    const m = String(Math.floor(this._s / 60)).padStart(2, "0");
    const s = String(this._s % 60).padStart(2, "0");
    return `${m}:${s}`;
  }
}

// ── CallSession (OOP, FIFO ICE queue DSA) ────────────────────────
class CallSession {
  constructor({ isVideo, onRemoteStream, onIceCandidate, onStateChange, onError }) {
    this.isVideo     = isVideo;
    this._onRemote   = onRemoteStream;
    this._onIce      = onIceCandidate;
    this._onState    = onStateChange;
    this._onError    = onError;
    this.pc          = null;
    this.localStream = null;
    // DSA: FIFO queue — buffers ICE candidates before remoteDesc is set
    this._iceQueue   = [];
    this._remoteSet  = false;
    this._destroyed  = false;
  }

  async init() {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.onicecandidate = (e) => {
      if (e.candidate) this._onIce(e.candidate);
    };

    this.pc.ontrack = (e) => {
      if (e.streams?.[0]) this._onRemote(e.streams[0]);
    };

    // Both "connected" and "completed" mean active call
    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState;
      if (!state) return;
      this._onState(state);
    };

    this.pc.oniceconnectionstatechange = () => {
      const s = this.pc?.iceConnectionState;
      if (s === "failed") {
        // ICE restart
        this.pc.restartIce?.();
      }
    };

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: this.isVideo
          ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
          : false,
      });
    } catch (e) {
      this._onError(this.isVideo
        ? "Cannot access camera/microphone. Check browser permissions."
        : "Cannot access microphone. Check browser permissions.");
      return null;
    }

    this.localStream.getTracks().forEach(t => this.pc.addTrack(t, this.localStream));
    return this.localStream;
  }

  async createOffer() {
    const offer = await this.pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: this.isVideo });
    await this.pc.setLocalDescription(offer);
    return this.pc.localDescription; // always use localDescription (may be updated by trickle ICE)
  }

  async handleOffer(offer) {
    if (this._destroyed) return null;
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    this._remoteSet = true;
    await this._drainQueue();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return this.pc.localDescription;
  }

  async handleAnswer(answer) {
    if (this._destroyed || this._remoteSet) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    this._remoteSet = true;
    await this._drainQueue();
  }

  async addIce(candidate) {
    if (this._destroyed) return;
    if (this._remoteSet) {
      try { await this.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    } else {
      this._iceQueue.push(candidate); // DSA: enqueue
    }
  }

  async _drainQueue() {
    // DSA: dequeue all buffered candidates in FIFO order
    while (this._iceQueue.length) {
      try { await this.pc.addIceCandidate(new RTCIceCandidate(this._iceQueue.shift())); } catch {}
    }
  }

  toggleMute() {
    const t = this.localStream?.getAudioTracks()[0];
    if (t) { t.enabled = !t.enabled; return !t.enabled; }
    return false;
  }

  toggleCamera() {
    const t = this.localStream?.getVideoTracks()[0];
    if (t) { t.enabled = !t.enabled; return !t.enabled; }
    return false;
  }

  destroy() {
    this._destroyed = true;
    this.localStream?.getTracks().forEach(t => t.stop());
    try { this.pc?.close(); } catch {}
    this.pc = null;
    this.localStream = null;
    this._iceQueue = [];
  }
}

// ═══════════════════════════════════════════════════════════════
// Incoming call banner
// ═══════════════════════════════════════════════════════════════
export function IncomingCallBanner({ call, onAccept, onReject }) {
  if (!call) return null;
  return (
    <div style={{
      position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
      zIndex: 9999, background: "rgba(15,18,32,.97)",
      border: "1.5px solid rgba(108,99,255,.4)", borderRadius: 18,
      padding: "18px 24px", boxShadow: "0 8px 40px rgba(0,0,0,.6)",
      display: "flex", alignItems: "center", gap: 16, minWidth: 280,
      backdropFilter: "blur(16px)", animation: "slideDown .3s ease",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: "50%",
        background: "linear-gradient(135deg,#6c63ff,#a78bfa)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        {call.isVideo
          ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.27 15z"/></svg>
        }
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginBottom: 2, textTransform: "uppercase", letterSpacing: ".05em" }}>
          Incoming {call.isVideo ? "video" : "voice"} call
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{call.callerName}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <BannerBtn onClick={onReject} color="#ef4444" title="Decline">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </BannerBtn>
        <BannerBtn onClick={onAccept} color="#22c55e" title="Accept">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </BannerBtn>
      </div>
    </div>
  );
}

function BannerBtn({ children, onClick, color, title }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 40, height: 40, borderRadius: "50%", border: "none",
      background: `${color}22`, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center", transition: "background .2s",
    }}
      onMouseEnter={e => e.currentTarget.style.background = `${color}44`}
      onMouseLeave={e => e.currentTarget.style.background = `${color}22`}
    >{children}</button>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Call overlay
// ═══════════════════════════════════════════════════════════════
export default function Call({ peer, isVideo, isCaller, currentUser, onEnd }) {
  const [phase,     setPhase]     = useState(isCaller ? "ringing" : "connecting");
  const [timer,     setTimer]     = useState("00:00");
  const [muted,     setMuted]     = useState(false);
  const [camOff,    setCamOff]    = useState(false);
  const [error,     setError]     = useState("");

  const sessionRef      = useRef(null);
  const timerRef        = useRef(null);
  const localVidRef     = useRef(null);
  const remoteVidRef    = useRef(null);
  const remoteAudioRef  = useRef(null);
  const remoteStreamRef = useRef(null);
  const endedRef        = useRef(false);

  // ── Attach stream to element ──────────────────────────────────
  const attachStream = useCallback((stream) => {
    remoteStreamRef.current = stream;
    if (isVideo && remoteVidRef.current) {
      remoteVidRef.current.srcObject = stream;
      remoteVidRef.current.play().catch(() => {});
    }
    if (!isVideo && remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = stream;
      remoteAudioRef.current.play().catch(() => {});
    }
  }, [isVideo]);

  // ── End call ──────────────────────────────────────────────────
  const endCall = useCallback((emit = true) => {
    if (endedRef.current) return;
    endedRef.current = true;
    if (emit) socket.emit("call:end", { to: peer._id });
    stopAllSounds();
    playHangup();
    timerRef.current?.stop();
    sessionRef.current?.destroy();
    onEnd();
  }, [peer._id, onEnd]);

  // ── Handle connection state change ───────────────────────────
  const handleStateChange = useCallback((state) => {
    if (state === "connected" || state === "completed") {
      stopAllSounds();
      playCallConnected();
      setPhase("active");
      timerRef.current = new CallTimer(setTimer);
      timerRef.current.start();
    } else if (state === "failed" || state === "disconnected") {
      endCall(true);
    }
  }, [endCall]);

  // ── Init session + socket ─────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    // ── Socket handlers (registered BEFORE session init) ────────
    const onAnswer = async ({ answer }) => {
      if (!mounted) return;
      await sessionRef.current?.handleAnswer(answer);
      setPhase("connecting");
    };

    const onIce = async ({ candidate }) => {
      if (!mounted || !candidate) return;
      await sessionRef.current?.addIce(candidate);
    };

    const onCallEnd = () => { if (mounted) endCall(false); };

    const onOffer = async ({ offer }) => {
      if (!mounted) return;
      // Wait for session to be ready (max 3s)
      let tries = 0;
      while (!sessionRef.current && tries++ < 30) await new Promise(r => setTimeout(r, 100));
      if (!sessionRef.current) return;
      const answer = await sessionRef.current.handleOffer(offer);
      if (answer) {
        socket.emit("call:answer", { to: peer._id, answer });
        setPhase("connecting");
      }
    };

    socket.on("call:answer",  onAnswer);
    socket.on("call:ice",     onIce);
    socket.on("call:ended",   onCallEnd);
    if (!isCaller) socket.on("call:offer", onOffer);

    // ── Init session ──────────────────────────────────────────
    (async () => {
      const session = new CallSession({
        isVideo,
        onRemoteStream: attachStream,
        onIceCandidate: (candidate) => socket.emit("call:ice", { to: peer._id, candidate }),
        onStateChange:  handleStateChange,
        onError: (msg) => { if (mounted) setError(msg); },
      });

      const localStream = await session.init();
      if (!localStream || !mounted) { session.destroy(); return; }

      sessionRef.current = session;

      // Attach local video
      if (localVidRef.current) {
        localVidRef.current.srcObject = localStream;
      }

      if (isCaller) {
        const offer = await session.createOffer();
        socket.emit("call:offer", {
          to: peer._id,
          offer,
          isVideo,
          callerName: currentUser.firstName || currentUser.username,
        });
        setPhase("ringing");
      }
    })();

    return () => {
      mounted = false;
      socket.off("call:answer",  onAnswer);
      socket.off("call:ice",     onIce);
      socket.off("call:ended",   onCallEnd);
      if (!isCaller) socket.off("call:offer", onOffer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = () => setMuted(!!sessionRef.current?.toggleMute());
  const toggleCam  = () => setCamOff(!!sessionRef.current?.toggleCamera());

  const peerName = peer.firstName
    ? `${peer.firstName} ${peer.lastName || ""}`.trim()
    : peer.username || "Unknown";

  const statusLabel = error
    ? error
    : phase === "ringing"    ? "Calling…"
    : phase === "connecting" ? "Connecting…"
    : phase === "active"     ? timer
    : "Ended";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(8,11,20,.97)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(24px)",
    }}>

      {/* Always-rendered audio element for voice */}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />

      {/* Video layout */}
      {isVideo && (
        <div style={{ position: "relative", width: "100%", maxWidth: 800, flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <video
            ref={el => {
              remoteVidRef.current = el;
              if (el && remoteStreamRef.current) { el.srcObject = remoteStreamRef.current; el.play().catch(() => {}); }
            }}
            autoPlay playsInline
            style={{ width: "100%", maxHeight: "65vh", borderRadius: 20, background: "#0a0c18", objectFit: "cover" }}
          />
          <video ref={localVidRef} autoPlay playsInline muted
            style={{
              position: "absolute", bottom: 16, right: 16,
              width: 140, height: 100, borderRadius: 14, objectFit: "cover",
              border: "2px solid rgba(108,99,255,.6)", background: "#0a0c18",
              display: camOff ? "none" : "block",
              boxShadow: "0 4px 20px rgba(0,0,0,.5)",
            }}
          />
        </div>
      )}

      {/* Voice call avatar */}
      {!isVideo && (
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{
            width: 100, height: 100, borderRadius: "50%",
            background: "linear-gradient(135deg,#6c63ff,#a78bfa)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 20px",
            boxShadow: phase === "active"
              ? "0 0 0 14px rgba(108,99,255,.12), 0 0 0 28px rgba(108,99,255,.06)"
              : "0 8px 32px rgba(108,99,255,.3)",
            transition: "box-shadow .6s",
          }}>
            <span style={{ fontSize: 38, fontWeight: 800, color: "#fff" }}>
              {peerName[0]?.toUpperCase() || "?"}
            </span>
          </div>
        </div>
      )}

      {/* Name + status */}
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
          {peerName}
        </div>
        <div style={{
          fontSize: 14,
          color: error ? "#f87171" : phase === "active" ? "#a78bfa" : "rgba(255,255,255,.4)",
          fontVariantNumeric: "tabular-nums",
          letterSpacing: phase === "active" ? "0.1em" : "normal",
        }}>
          {statusLabel}
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <CtrlBtn active={muted} activeColor="rgba(239,68,68,.25)" title={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
          {muted
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          }
        </CtrlBtn>

        {isVideo && (
          <CtrlBtn active={camOff} activeColor="rgba(239,68,68,.25)" title={camOff ? "Camera on" : "Camera off"} onClick={toggleCam}>
            {camOff
              ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/><circle cx="12" cy="13" r="3"/></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7 16 12 23 17V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            }
          </CtrlBtn>
        )}

        {/* End call */}
        <button onClick={() => endCall(true)} title="End call" style={{
          width: 64, height: 64, borderRadius: "50%", border: "none",
          background: "linear-gradient(135deg,#ef4444,#dc2626)",
          boxShadow: "0 4px 24px rgba(239,68,68,.5)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          transition: "transform .15s, box-shadow .15s",
        }}
          onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = "0 6px 32px rgba(239,68,68,.7)"; }}
          onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)";    e.currentTarget.style.boxShadow = "0 4px 24px rgba(239,68,68,.5)"; }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.67 12a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 3.6.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11z"/>
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes slideDown {
          from { transform: translate(-50%, -20px); opacity: 0; }
          to   { transform: translate(-50%, 0);     opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function CtrlBtn({ children, onClick, title, active, activeColor }) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 54, height: 54, borderRadius: "50%", border: "none",
      background: active ? activeColor : "rgba(255,255,255,.08)",
      cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      color: active ? "#ef4444" : "rgba(255,255,255,.8)",
      transition: "all .2s",
    }}
      onMouseEnter={e => { e.currentTarget.style.background = active ? activeColor : "rgba(255,255,255,.15)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = active ? activeColor : "rgba(255,255,255,.08)"; }}
    >{children}</button>
  );
}