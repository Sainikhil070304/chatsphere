import { useState, useEffect, useRef } from "react";
import "./style.css";
import { socket } from "./socket";
import Login from "./components/Login";
import Register from "./components/Register";
import ChatList from "./components/ChatList";
import ChatWindow from "./components/ChatWindow";
import Profile from "./components/Profile";
import AdminPanel from "./components/AdminPanel";
import UserProfile from "./components/UserProfile";
import Feed from "./components/Feed";
import Call, { IncomingCallBanner } from "./components/Call";
import {
  resumeAudio, startCallRing, stopAllSounds,
  startOutgoingRing,
  playHangup,
} from "./services/sounds";

const BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace("/api", "")
  : "http://localhost:5000";

const imgSrc = (s) => !s ? "" : s.startsWith("http") ? s : `${BASE}${s}`;

export default function App() {
  const [user,           setUser]        = useState(null);
  const [chat,           setChat]        = useState(null);
  const [view,           setView]        = useState("chat");
  const [onlineUsers,    setOnlineUsers] = useState([]);
  const [authScreen,     setAuthScreen]  = useState("login");
  const [viewingProfile, setViewing]     = useState(null);
  const [activeCall,     setActiveCall]  = useState(null);
  const [incomingCall,   setIncoming]    = useState(null);
  const incomingRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("me");
    const token = localStorage.getItem("token");
    if (saved && token) {
      const me = JSON.parse(saved);
      setUser(me);
      socket.emit("online", me._id);
      socket.emit("getOnline");
    }
  }, []);

  useEffect(() => {
    const onList    = l  => setOnlineUsers(l.map(String));
    const onOnline  = id => setOnlineUsers(p => [...new Set([...p, String(id)])]);
    const onOffline = id => setOnlineUsers(p => p.filter(u => u !== String(id)));
    const onConnect = () => {
      const me = JSON.parse(localStorage.getItem("me")||"null");
      if (me) { socket.emit("online", me._id); socket.emit("getOnline"); }
    };
    const onIncomingCall = (data) => {
      incomingRef.current = data;
      setIncoming(data);
      startCallRing();
    };
    const onCallRejected = () => {
      stopAllSounds();
      playHangup();
      setActiveCall(null);
      alert("Call was declined.");
    };
    const onCallEnded = () => { setActiveCall(null); };

    socket.on("onlineList",    onList);
    socket.on("userOnline",    onOnline);
    socket.on("userOffline",   onOffline);
    socket.on("connect",       onConnect);
    socket.on("call:incoming", onIncomingCall);
    socket.on("call:rejected", onCallRejected);
    socket.on("call:ended",    onCallEnded);
    return () => {
      socket.off("onlineList",    onList);
      socket.off("userOnline",    onOnline);
      socket.off("userOffline",   onOffline);
      socket.off("connect",       onConnect);
      socket.off("call:incoming", onIncomingCall);
      socket.off("call:rejected", onCallRejected);
      socket.off("call:ended",    onCallEnded);
    };
  }, []);

  const handleLogin  = u => { setUser(u); socket.emit("online", u._id); socket.emit("getOnline"); };
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("me");
    setUser(null); setChat(null); setView("chat"); setOnlineUsers([]);
  };

  const handleViewProfile = (chatUser) => {
    if (chatUser.username) { setViewing(chatUser.username); setView("userprofile"); }
  };

  const handleStartChatFromProfile = async (profileUser) => {
    const API = (await import("./services/api")).default;
    const res = await API.post("/chat/create", { userId: profileUser._id });
    setChat({
      _id: profileUser._id,
      name: [profileUser.firstName, profileUser.lastName].filter(Boolean).join(" ") || profileUser.username,
      username: profileUser.username,
      avatar: profileUser.avatar,
      chatId: res.data._id,
    });
    setView("chat");
  };

  const startCall = (targetUser, callType) => {
    resumeAudio();
    startOutgoingRing();
    setActiveCall({ peer: targetUser, isVideo: callType === "video", isCaller: true });
    setIncoming(null);
  };

  const acceptCall = () => {
    const incoming = incomingRef.current;
    if (!incoming) return;
    stopAllSounds();
    resumeAudio();
    setActiveCall({
      peer: {
        _id: incoming.from,
        firstName: incoming.fromName || incoming.callerName || "Caller",
        username:  incoming.fromName || incoming.callerName || "Caller",
      },
      isVideo:  incoming.callType === "video" || incoming.isVideo,
      isCaller: false,
    });
    setIncoming(null);
    incomingRef.current = null;
  };

  const rejectCall = () => {
    const incoming = incomingRef.current;
    if (incoming) socket.emit("call:rejected", { to: incoming.from });
    stopAllSounds();
    playHangup();
    setIncoming(null);
    incomingRef.current = null;
  };

  if (!user) return (
    <div className="auth-page">
      <div className="auth-brand">
        <div className="brand-logo" style={{width:52,height:52,borderRadius:16,background:"linear-gradient(135deg,#6c63ff,#a78bfa)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px"}}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <h1>ChatSphere</h1>
        <p>Encrypted. Private. Real-time.</p>
      </div>
      {authScreen === "login"
        ? <Login setUser={handleLogin} onSwitchToRegister={() => setAuthScreen("register")} />
        : <Register onSwitchToLogin={() => setAuthScreen("login")} />
      }
    </div>
  );

  return (
    <div className="app">
      {/* ── Sidebar ── */}
      <div className="sidebar">
        <div className="sidebar-top">
          <div className="brand-mini">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c6bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
        </div>
        <div className="nav-icons">
          <button className={`nav-icon ${view==="chat"?"active":""}`} onClick={() => setView("chat")} title="Messages">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button className={`nav-icon ${view==="feed"?"active":""}`} onClick={() => setView("feed")} title="Feed">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </button>
          <button className={`nav-icon ${view==="profile"?"active":""}`} onClick={() => setView("profile")} title="My Profile">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </button>
          {user.isAdmin && (
            <button className={`nav-icon ${view==="admin"?"active":""}`} onClick={() => setView("admin")} title="Admin">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </button>
          )}
        </div>
        <div className="nav-bottom">
          <div className="user-avatar-mini" onClick={() => setView("profile")}>
            {user.avatar
              ? <img src={imgSrc(user.avatar)} alt="" />
              : <span>{(user.firstName||user.username||"?")?.[0]?.toUpperCase()}</span>
            }
            <div className="online-ring" />
          </div>
          <button className="logout-btn" onClick={handleLogout} title="Logout">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>

      {/* ── Main content ── */}
      {view === "chat" && (
        <>
          <ChatList open={setChat} currentUser={user} onlineUsers={onlineUsers} socket={socket} />
          {chat
            ? <ChatWindow key={chat.chatId} user={chat} currentUser={user} onlineUsers={onlineUsers} onViewProfile={handleViewProfile} onStartCall={startCall} />
            : <div className="empty-chat">
                <div className="empty-inner">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <h3>ChatSphere</h3>
                  <p>Select a conversation to start messaging</p>
                </div>
              </div>
          }
        </>
      )}
      {view === "feed"        && <Feed currentUser={user} />}
      {view === "profile"     && <Profile user={user} setUser={u => { setUser(u); localStorage.setItem("me",JSON.stringify(u)); }} onBack={() => setView("chat")} />}
      {view === "admin"       && user.isAdmin && <AdminPanel onBack={() => setView("chat")} />}
      {view === "userprofile" && <UserProfile username={viewingProfile} currentUser={user} onBack={() => setView("chat")} onStartChat={handleStartChatFromProfile} />}

      {activeCall && (
        <Call
          peer={activeCall.peer}
          isVideo={activeCall.isVideo}
          isCaller={activeCall.isCaller}
          currentUser={user}
          onEnd={() => setActiveCall(null)}
        />
      )}

      <IncomingCallBanner
        call={incomingCall && !activeCall ? {
          callerName: incomingCall.fromName || incomingCall.callerName || "Someone",
          isVideo: incomingCall.callType === "video" || incomingCall.isVideo,
        } : null}
        onAccept={acceptCall}
        onReject={rejectCall}
      />
    </div>
  );
}