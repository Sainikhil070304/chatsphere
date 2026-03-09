// ════════════════════════════════════════════════════════════════
// VideoCall.jsx — WebRTC audio/video calls via socket signalling
// OOP: RTCCallManager class | ICE STUN servers for NAT traversal
// ════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

class RTCCallManager {
  constructor(onRemoteStream, onEnd) {
    this.pc            = null;
    this.onRemoteStream = onRemoteStream;
    this.onEnd         = onEnd;
  }

  async init(stream) {
    this.pc = new RTCPeerConnection(ICE_SERVERS);
    stream.getTracks().forEach(t => this.pc.addTrack(t, stream));
    this.pc.ontrack = e => this.onRemoteStream(e.streams[0]);
    this.pc.onicecandidate = e => {
      if (e.candidate) socket.emit("iceCandidate", { candidate: e.candidate });
    };
    this.pc.onconnectionstatechange = () => {
      if (["disconnected","failed","closed"].includes(this.pc.connectionState)) this.onEnd();
    };
  }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async acceptOffer(offer) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async acceptAnswer(answer) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async addIceCandidate(candidate) {
    try { await this.pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  }

  destroy() {
    this.pc?.close(); this.pc = null;
  }
}

export default function VideoCall({ user, currentUser, callType, incomingCall, onEnd }) {
  const [status,   setStatus]   = useState(incomingCall ? "incoming" : "calling");
  const [muted,    setMuted]    = useState(false);
  const [camOff,   setCamOff]   = useState(false);
  const [duration, setDuration] = useState(0);
  const localRef   = useRef(null);
  const remoteRef  = useRef(null);
  const streamRef  = useRef(null);
  const managerRef = useRef(null);
  const timerRef   = useRef(null);

  const displayName = user.name || [user.firstName,user.lastName].filter(Boolean).join(" ") || user.username || "User";
  const isVideo     = callType === "video";

  const startTimer = () => {
    timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
  };
  const fmtDur = s => `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  const endCall = () => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    managerRef.current?.destroy();
    socket.emit("endCall", { to: user._id });
    onEnd();
  };

  useEffect(() => {
    const onRemoteStream = (stream) => {
      if (remoteRef.current) remoteRef.current.srcObject = stream;
      setStatus("connected");
      startTimer();
    };
    managerRef.current = new RTCCallManager(onRemoteStream, endCall);

    const initStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideo });
        streamRef.current = stream;
        if (localRef.current) localRef.current.srcObject = stream;
        await managerRef.current.init(stream);

        if (!incomingCall) {
          // Caller: create and send offer
          const offer = await managerRef.current.createOffer();
          socket.emit("callUser", { to: user._id, offer, callType });
        }
      } catch (e) {
        alert("Could not access camera/microphone: " + e.message);
        onEnd();
      }
    };

    initStream();

    socket.on("callAccepted", async ({ answer }) => {
      await managerRef.current?.acceptAnswer(answer);
    });
    socket.on("iceCandidate", async ({ candidate }) => {
      await managerRef.current?.addIceCandidate(candidate);
    });
    socket.on("endCall", () => { setStatus("ended"); setTimeout(onEnd, 1500); });

    return () => {
      clearInterval(timerRef.current);
      socket.off("callAccepted"); socket.off("iceCandidate"); socket.off("endCall");
      streamRef.current?.getTracks().forEach(t => t.stop());
      managerRef.current?.destroy();
    };
  }, []);

  const accept = async () => {
    setStatus("connected");
    const answer = await managerRef.current.acceptOffer(incomingCall.offer);
    socket.emit("callAccepted", { to: incomingCall.from, answer });
    startTimer();
  };

  const toggleMute = () => {
    streamRef.current?.getAudioTracks().forEach(t => t.enabled = !t.enabled);
    setMuted(m => !m);
  };
  const toggleCam = () => {
    streamRef.current?.getVideoTracks().forEach(t => t.enabled = !t.enabled);
    setCamOff(c => !c);
  };

  return (
    <div className="call-overlay">
      <div className="call-modal">
        {/* Remote video / avatar */}
        <div className="call-remote">
          {isVideo ? (
            <video ref={remoteRef} autoPlay playsInline className="call-remote-video" />
          ) : (
            <div className="call-avatar-large">
              {user.avatar ? <img src={`http://localhost:5000${user.avatar}`} alt="" /> : <span>{displayName[0]?.toUpperCase()}</span>}
            </div>
          )}
          <div className="call-name">{displayName}</div>
          <div className="call-status">
            {status === "incoming"   && `Incoming ${isVideo?"video":"audio"} call...`}
            {status === "calling"    && "Calling..."}
            {status === "connected"  && fmtDur(duration)}
            {status === "ended"      && "Call ended"}
          </div>
        </div>

        {/* Local video (pip) */}
        {isVideo && status === "connected" && (
          <video ref={localRef} autoPlay playsInline muted className="call-local-video" />
        )}

        {/* Controls */}
        <div className="call-controls">
          {status === "incoming" ? (
            <>
              <button className="call-btn-accept" onClick={accept}>📞 Accept</button>
              <button className="call-btn-reject" onClick={() => { socket.emit("callRejected",{to:incomingCall.from}); onEnd(); }}>📵 Decline</button>
            </>
          ) : (
            <>
              <button className={`call-ctrl ${muted?"active":""}`} onClick={toggleMute}>{muted?"🔇":"🎙️"}</button>
              {isVideo && <button className={`call-ctrl ${camOff?"active":""}`} onClick={toggleCam}>{camOff?"📷":"📸"}</button>}
              <button className="call-ctrl end" onClick={endCall}>📵</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
