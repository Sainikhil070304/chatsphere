// ═══════════════════════════════════════════════════════════════════
// Call.jsx  — Voice & Video Calls via WebRTC + Socket.IO signalling
//
// OOP:
//   CallSession  — manages one peer connection lifecycle
//   CallTimer    — tracks call duration with start/stop/format
//
// DSA:
//   ICE candidate queue (Array as FIFO) — buffers candidates that
//   arrive before remote description is set, drains on setRemote()
//   State machine: idle → ringing → connecting → active → ended
// ═══════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState, useCallback } from "react";
import { socket } from "../socket";
import { stopCallRing, stopOutgoingRing, stopAllSounds, playCallConnected, playHangup } from "../services/sounds";

// ── OOP: Call duration timer ────────────────────────────────────────
class CallTimer {
  constructor(onTick) {
    this._onTick  = onTick;
    this._seconds = 0;
    this._id      = null;
  }
  start() {
    this._seconds = 0;
    this._id = setInterval(() => { this._seconds++; this._onTick(this._fmt()); }, 1000);
  }
  stop() { clearInterval(this._id); this._id = null; }
  _fmt() {
    const m = String(Math.floor(this._seconds / 60)).padStart(2, "0");
    const s = String(this._seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  }
}

// ── OOP: Peer connection lifecycle ──────────────────────────────────
class CallSession {
  constructor({ isVideo, onRemoteStream, onIceCandidate, onStateChange }) {
    this.isVideo         = isVideo;
    this._onRemote       = onRemoteStream;
    this._onIce          = onIceCandidate;
    this._onStateChange  = onStateChange;
    this.pc              = null;
    this.localStream     = null;
    // DSA: FIFO queue for ICE candidates arriving before remoteDesc
    this._iceBuf         = [];
    this._remoteSet      = false;
  }

  async init() {
    this.pc = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });

    this.pc.onicecandidate = (e) => {
      if (e.candidate) this._onIce(e.candidate);
    };

    this.pc.ontrack = (e) => {
      this._onRemote(e.streams[0]);
    };

    this.pc.onconnectionstatechange = () => {
      this._onStateChange(this.pc.connectionState);
    };

    // Capture local media
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: this.isVideo ? { width: 640, height: 480, facingMode: "user" } : false,
    });

    this.localStream.getTracks().forEach((t) => this.pc.addTrack(t, this.localStream));
    return this.localStream;
  }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(offer) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    this._remoteSet = true;
    await this._drainIceQueue();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(answer) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    this._remoteSet = true;
    await this._drainIceQueue();
  }

  async addIceCandidate(candidate) {
    if (this._remoteSet) {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      // DSA: enqueue until remote description is ready
      this._iceBuf.push(candidate);
    }
  }

  async _drainIceQueue() {
    // DSA: dequeue all buffered ICE candidates
    while (this._iceBuf.length > 0) {
      const c = this._iceBuf.shift();
      await this.pc.addIceCandidate(new RTCIceCandidate(c));
    }
  }

  toggleMute() {
    const track = this.localStream?.getAudioTracks()[0];
    if (track) { track.enabled = !track.enabled; return !track.enabled; }
    return false;
  }

  toggleCamera() {
    const track = this.localStream?.getVideoTracks()[0];
    if (track) { track.enabled = !track.enabled; return !track.enabled; }
    return false;
  }

  destroy() {
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc?.close();
    this.pc = null;
    this.localStream = null;
    this._iceBuf = [];
    this._remoteSet = false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// Incoming call popup (shown to callee)
// ═══════════════════════════════════════════════════════════════════
export function IncomingCallBanner({ call, onAccept, onReject }) {
  if (!call) return null;
  return (
    <div style={{
      position:"fixed", top:16, left:"50%", transform:"translateX(-50%)",
      zIndex:9999, background:"rgba(15,18,32,.97)",
      border:"1.5px solid rgba(108,99,255,.4)",
      borderRadius:18, padding:"18px 24px", boxShadow:"0 8px 40px rgba(0,0,0,.6)",
      display:"flex", alignItems:"center", gap:16, minWidth:280,
      backdropFilter:"blur(16px)",
      animation:"slideDown .3s ease",
    }}>
      <div style={{
        width:44, height:44, borderRadius:"50%",
        background:"linear-gradient(135deg,#6c63ff,#a78bfa)",
        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
      }}>
        {call.isVideo
          ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.27 15z"/></svg>
        }
      </div>
      <div style={{flex:1}}>
        <div style={{fontSize:11, color:"rgba(255,255,255,.45)", marginBottom:2, textTransform:"uppercase", letterSpacing:".05em"}}>
          Incoming {call.isVideo ? "video" : "voice"} call
        </div>
        <div style={{fontSize:15, fontWeight:700, color:"#fff"}}>{call.callerName}</div>
      </div>
      <div style={{display:"flex", gap:8}}>
        <button onClick={onReject} title="Decline" style={{
          width:40, height:40, borderRadius:"50%", border:"none",
          background:"rgba(239,68,68,.15)", cursor:"pointer",
          display:"flex", alignItems:"center", justifyContent:"center",
          transition:"background .2s",
        }}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(239,68,68,.35)"}
          onMouseLeave={e=>e.currentTarget.style.background="rgba(239,68,68,.15)"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <button onClick={onAccept} title="Accept" style={{
          width:40, height:40, borderRadius:"50%", border:"none",
          background:"rgba(34,197,94,.15)", cursor:"pointer",
          display:"flex", alignItems:"center", justifyContent:"center",
          transition:"background .2s",
        }}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(34,197,94,.35)"}
          onMouseLeave={e=>e.currentTarget.style.background="rgba(34,197,94,.15)"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Main Call overlay (shown to both caller and callee during call)
// ═══════════════════════════════════════════════════════════════════
export default function Call({ peer, isVideo: initVideo, isCaller, currentUser, onEnd }) {
  // State machine: ringing → connecting → active → ended
  const [phase,    setPhase]    = useState(isCaller ? "ringing" : "connecting");
  const [timer,    setTimer]    = useState("00:00");
  const [muted,    setMuted]    = useState(false);
  const [camOff,   setCamOff]   = useState(false);
  const [connState,setConnState]= useState("");
  const [error,    setError]    = useState("");

  const sessionRef     = useRef(null);
  const timerRef       = useRef(null);
  const localVidRef    = useRef(null);
  const remoteVidRef   = useRef(null);
  const remoteStreamRef= useRef(null);  // stores stream if element not yet mounted

  const isVideo = initVideo;

  // ── End call cleanly ─────────────────────────────────────────
  const endCall = useCallback((emit = true) => {
    if (emit) socket.emit("call:end", { to: peer._id });
    stopAllSounds();   // kills ALL ring intervals + closes zombie audio nodes
    playHangup();
    timerRef.current?.stop();
    sessionRef.current?.destroy();
    onEnd();
  }, [peer._id, onEnd]);

  // ── Start session (both sides) ───────────────────────────────
  const startSession = useCallback(async () => {
    try {
      const session = new CallSession({
        isVideo,
        onRemoteStream: (stream) => {
          // Store stream so if element mounts after stream arrives, we can attach
          remoteStreamRef.current = stream;
          if (remoteVidRef.current) {
            remoteVidRef.current.srcObject = stream;
            remoteVidRef.current.play().catch(() => {});
          }
        },
        onIceCandidate: (candidate) => {
          socket.emit("call:ice", { to: peer._id, candidate });
        },
        onStateChange: (state) => {
          setConnState(state);
          if (state === "connected") {
            stopAllSounds();
            playCallConnected();
            setPhase("active");
            timerRef.current = new CallTimer(setTimer);
            timerRef.current.start();
          }
          if (state === "disconnected" || state === "failed") endCall(true);
        },
      });

      const localStream = await session.init();
      sessionRef.current = session;

      if (localVidRef.current) {
        localVidRef.current.srcObject = localStream;
        localVidRef.current.muted = true;
      }

      if (isCaller) {
        const offer = await session.createOffer();
        socket.emit("call:offer", { to: peer._id, offer, isVideo, callerName: currentUser.firstName || currentUser.username });
      }
    } catch (e) {
      setError("Could not access " + (isVideo ? "camera/microphone" : "microphone") + ". Check permissions.");
    }
  }, [isVideo, isCaller, peer._id, currentUser, endCall]);

  // ── Socket events ────────────────────────────────────────────
  useEffect(() => {
    // IMPORTANT: Register ALL socket handlers BEFORE startSession() so we
    // never miss an event that arrives while the async init is in progress.

    const onAnswer = async ({ answer }) => {
      if (sessionRef.current) {
        await sessionRef.current.handleAnswer(answer);
        setPhase("connecting");
      }
    };

    const onIce = async ({ candidate }) => {
      await sessionRef.current?.addIceCandidate(candidate);
    };

    const onCallEnd = () => endCall(false);

    // Callee: handle offer (may arrive very quickly after banner is accepted)
    const handleOffer = async ({ offer }) => {
      if (!sessionRef.current) {
        // Session not ready yet — wait up to 3s then retry
        let waited = 0;
        const wait = setInterval(async () => {
          waited += 100;
          if (sessionRef.current) {
            clearInterval(wait);
            const answer = await sessionRef.current.handleOffer(offer);
            socket.emit("call:answer", { to: peer._id, answer });
            setPhase("connecting");
          } else if (waited >= 3000) {
            clearInterval(wait);
          }
        }, 100);
        return;
      }
      const answer = await sessionRef.current.handleOffer(offer);
      socket.emit("call:answer", { to: peer._id, answer });
      setPhase("connecting");
    };

    socket.on("call:answer", onAnswer);
    socket.on("call:ice",    onIce);
    socket.on("call:ended",  onCallEnd);
    if (!isCaller) socket.on("call:offer", handleOffer);

    // Start session AFTER handlers are registered
    startSession();

    return () => {
      socket.off("call:answer", onAnswer);
      socket.off("call:ice",    onIce);
      socket.off("call:ended",  onCallEnd);
      if (!isCaller) socket.off("call:offer", handleOffer);
    };
  }, [startSession, endCall, isCaller, peer._id]);

  const toggleMute = () => {
    const muted = sessionRef.current?.toggleMute();
    setMuted(!!muted);
  };

  const toggleCam = () => {
    const off = sessionRef.current?.toggleCamera();
    setCamOff(!!off);
  };

  const phaseLbl = phase === "ringing" ? "Calling..." : phase === "connecting" ? "Connecting..." : phase === "active" ? timer : "Ended";

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:9000,
      background: isVideo ? "rgba(8,11,20,.97)" : "rgba(8,11,20,.95)",
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      backdropFilter:"blur(24px)",
    }}>

      {/* ── Video views ── */}
      {isVideo && (
        <div style={{position:"relative", width:"100%", maxWidth:720, flex:1, display:"flex", alignItems:"center", justifyContent:"center"}}>
          {/* Remote (full) */}
          <video
            ref={el => {
              remoteVidRef.current = el;
              if (el && remoteStreamRef.current) {
                el.srcObject = remoteStreamRef.current;
                el.play().catch(() => {});
              }
            }}
            autoPlay playsInline
            style={{width:"100%", maxHeight:"60vh", borderRadius:20, background:"#111", objectFit:"cover"}}
          />
          {/* Local (pip) */}
          <video ref={localVidRef} autoPlay playsInline muted
            style={{
              position:"absolute", bottom:12, right:12,
              width:120, height:90, borderRadius:12, objectFit:"cover",
              border:"2px solid rgba(108,99,255,.5)", background:"#0a0c18",
              display: camOff ? "none" : "block",
            }}
          />
        </div>
      )}

      {/* ── Voice call avatar ── */}
      {!isVideo && (
        <div style={{textAlign:"center", marginBottom:32}}>
          <div style={{
            width:90, height:90, borderRadius:"50%",
            background:"linear-gradient(135deg,#6c63ff,#a78bfa)",
            display:"flex", alignItems:"center", justifyContent:"center",
            margin:"0 auto 16px",
            boxShadow: phase === "active" ? "0 0 0 12px rgba(108,99,255,.15), 0 0 0 24px rgba(108,99,255,.07)" : "none",
            transition:"box-shadow .5s",
          }}>
            <span style={{fontSize:32, fontWeight:800, color:"#fff"}}>
              {(peer.firstName||peer.username||"?")[0].toUpperCase()}
            </span>
          </div>
          <audio
            ref={el => {
              remoteVidRef.current = el;
              if (el && remoteStreamRef.current) {
                el.srcObject = remoteStreamRef.current;
                el.play().catch(() => {});
              }
            }}
            autoPlay
          />
        </div>
      )}

      {/* ── Name + status ── */}
      <div style={{textAlign:"center", marginBottom:24}}>
        <div style={{fontSize:22, fontWeight:700, color:"#fff", marginBottom:4}}>
          {peer.firstName ? `${peer.firstName} ${peer.lastName||""}`.trim() : peer.username}
        </div>
        <div style={{
          fontSize:14, color: phase === "active" ? "#a78bfa" : "rgba(255,255,255,.4)",
          fontVariantNumeric:"tabular-nums",
        }}>
          {error || phaseLbl}
        </div>
      </div>

      {/* ── Controls ── */}
      <div style={{display:"flex", gap:16, alignItems:"center"}}>

        {/* Mute */}
        <CtrlBtn
          active={muted}
          activeColor="rgba(239,68,68,.2)"
          title={muted ? "Unmute" : "Mute"}
          onClick={toggleMute}
        >
          {muted
            ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
            : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          }
        </CtrlBtn>

        {/* Camera (video only) */}
        {isVideo && (
          <CtrlBtn
            active={camOff}
            activeColor="rgba(239,68,68,.2)"
            title={camOff ? "Camera on" : "Camera off"}
            onClick={toggleCam}
          >
            {camOff
              ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34"/><circle cx="12" cy="13" r="3"/></svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7 16 12 23 17V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            }
          </CtrlBtn>
        )}

        {/* End call */}
        <CtrlBtn
          onClick={() => endCall(true)}
          title="End call"
          style={{
            width:60, height:60, borderRadius:"50%",
            background:"linear-gradient(135deg,#ef4444,#dc2626)",
            boxShadow:"0 4px 20px rgba(239,68,68,.4)",
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.67 12a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 3.6.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11z"/>
          </svg>
        </CtrlBtn>

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

function CtrlBtn({ children, onClick, title, active, activeColor, style = {} }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width:52, height:52, borderRadius:"50%", border:"none",
        background: active ? activeColor : "rgba(255,255,255,.08)",
        cursor:"pointer",
        display:"flex", alignItems:"center", justifyContent:"center",
        color: active ? "#ef4444" : "rgba(255,255,255,.8)",
        transition:"all .2s",
        ...style,
      }}
      onMouseEnter={e => { if (!style.background) e.currentTarget.style.background = active ? activeColor : "rgba(255,255,255,.15)"; }}
      onMouseLeave={e => { if (!style.background) e.currentTarget.style.background = active ? activeColor : "rgba(255,255,255,.08)"; }}
    >
      {children}
    </button>
  );
}