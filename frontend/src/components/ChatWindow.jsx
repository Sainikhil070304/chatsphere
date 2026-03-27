import { useEffect, useState, useRef } from "react";
import { socket, messageListeners, messageBuffer } from "../socket";
import API from "../services/api";
import { encryptMsg, safeDecrypt } from "../crypto";
import { playMessageSound, playSentSound, playTypingSound, resumeAudio } from "../services/sounds";

const fmt=t=>t?new Date(t).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}):"";
const fmtDate=t=>{if(!t)return"";const d=new Date(t),now=new Date();if(d.toDateString()===now.toDateString())return"Today";const y=new Date(now);y.setDate(y.getDate()-1);if(d.toDateString()===y.toDateString())return"Yesterday";return d.toLocaleDateString([],{month:"short",day:"numeric"});};
const fmtSize=b=>!b?"":b<1048576?(b/1024).toFixed(1)+"KB":(b/1048576).toFixed(1)+"MB";
const canUnsend=time=>time&&(Date.now()-new Date(time).getTime())<3600000;
const BASE = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace("/api","") : "http://localhost:5000";
const imgSrc=s=>!s?"":s.startsWith("http")?s:`${BASE}${s}`;

const withSeps = (msgs) => {
  const r = []; let last = "";
  msgs.forEach(m => {
    const d = fmtDate(m.time);
    if (d && d !== last) { r.push({ type:"sep", label:d }); last = d; }
    r.push(m);
  });
  return r;
};

const BARS = [3,5,8,6,10,7,12,9,6,11,8,5,9,7,4,10,8,6,11,7,5,9,6,8,4,7,10,6,8,5];

function VoicePlayer({ src, isMe }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) audioRef.current.pause();
    else audioRef.current.play().catch(() => {});
    setPlaying(p => !p);
  };

  const seek = (e) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audioRef.current.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  };

  const fmtT = s => {
    if (!s || isNaN(s)) return "0:00";
    return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,"0")}`;
  };

  const pct = duration > 0 ? current / duration : 0;
  const filled   = isMe ? "rgba(255,255,255,0.9)"  : "#a78bfa";
  const unfilled = isMe ? "rgba(255,255,255,0.28)" : "rgba(167,139,250,0.28)";
  const btnBg    = isMe ? "rgba(255,255,255,0.18)" : "rgba(124,107,250,0.18)";
  const btnIcon  = isMe ? "#fff" : "#a78bfa";
  const timeTxt  = isMe ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.4)";
  const activeBars = Math.round(pct * BARS.length);

  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, padding:"6px 4px", minWidth:210, maxWidth:250 }}>
      <audio ref={audioRef} src={src}
        onLoadedMetadata={e => setDuration(e.target.duration)}
        onTimeUpdate={e => setCurrent(e.target.currentTime)}
        onEnded={() => { setPlaying(false); setCurrent(0); if(audioRef.current) audioRef.current.currentTime=0; }}
      />
      <div style={{ width:38, height:38, borderRadius:"50%", flexShrink:0,
        background: isMe ? "rgba(255,255,255,0.12)" : "rgba(124,107,250,0.15)",
        display:"flex", alignItems:"center", justifyContent:"center" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={btnIcon} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
          <line x1="12" y1="19" x2="12" y2="23"/>
          <line x1="8" y1="23" x2="16" y2="23"/>
        </svg>
      </div>
      <div style={{ flex:1, display:"flex", flexDirection:"column", gap:6 }}>
        <div style={{ display:"flex", alignItems:"center", gap:2, height:24, cursor:"pointer" }} onClick={seek}>
          {BARS.map((h, i) => (
            <div key={i} style={{ width:3, borderRadius:3, flexShrink:0,
              height:`${(h/12)*100}%`,
              background: i < activeBars ? filled : unfilled,
              transition:"background 0.1s" }}/>
          ))}
        </div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:11, color:timeTxt, fontVariantNumeric:"tabular-nums" }}>
            {playing ? fmtT(current) : fmtT(duration)}
          </span>
          <button onClick={toggle} style={{ width:28, height:28, borderRadius:"50%", border:"none",
            background:btnBg, cursor:"pointer", padding:0,
            display:"flex", alignItems:"center", justifyContent:"center", transition:"all .15s" }}>
            {playing
              ? <svg width="11" height="11" viewBox="0 0 24 24" fill={btnIcon}><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              : <svg width="11" height="11" viewBox="0 0 24 24" fill={btnIcon}><polygon points="6 3 20 12 6 21 6 3"/></svg>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ChatWindow({ user, currentUser, onlineUsers=[], onViewProfile, onBack, onStartCall, isMobile=false }) {
  const [msg,        setMsg]        = useState("");
  const [list,       setList]       = useState([]);
  const [typing,     setTyping]     = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [showInfo,   setShowInfo]   = useState(false);
  const [ctxMenu,    setCtxMenu]    = useState(null);
  const [groupData,  setGroupData]  = useState(null);
  const [addingUser, setAddingUser] = useState("");
  const [allUsers,   setAllUsers]   = useState([]);
  const [recording,  setRecording]  = useState(false);
  const [recSecs,    setRecSecs]    = useState(0);

  const bottomRef   = useRef(null);
  const typingTimer = useRef(null);
  const meRef       = useRef(currentUser || JSON.parse(localStorage.getItem("me")));
  const fileRef     = useRef();
  const groupPhotoRef = useRef();
  const mediaRecRef = useRef(null);
  const audioChunks = useRef([]);
  const recTimer    = useRef(null);

  const isGroup     = !!user.isGroup;
  const isOnline    = !isGroup && onlineUsers.includes(String(user._id));
  const displayName = user.name || [user.firstName,user.lastName].filter(Boolean).join(" ") || user.username || "User";
  const adminId     = String(groupData?.admin?._id || user.admin?._id || "");
  const isAdmin     = isGroup && adminId === String(meRef.current._id);
  const members     = groupData?.members || user.members || [];

  useEffect(() => {
    if (isGroup) {
      API.get(`/groups/info/${user.chatId}`).then(r => setGroupData(r.data)).catch(() => {});
      API.get("/user").then(r => setAllUsers(r.data)).catch(() => {});
    }
  }, [user._id, user.chatId]);

  const parseMsg = async (m) => {
    if (m.unsent || m.encrypted === "UNSENT")
      return { _id:m._id, text:"Message unsent", type:"unsent",
        me: String(m.sender?._id||m.sender||m.from) === String(meRef.current._id),
        time:m.createdAt, senderName:m.sender?.firstName||m.senderName||"", unsent:true };
    const raw = m.encrypted || m.text || "";
    let text = "", type = m.type || "text", fileInfo = null;
    if (raw.startsWith("IMG:"))        { text = raw.slice(4); type = "image"; }
    else if (raw.startsWith("AUDIO:")) { text = raw.slice(6); type = "audio"; }
    else if (raw.startsWith("FILE:"))  { const p = JSON.parse(raw.slice(5)); text = p.url; type = "file"; fileInfo = {name:p.name,size:p.size,url:p.url}; }
    else if (raw.startsWith("AES:"))   { text = raw.slice(4); type = "text"; }
    else if (raw.startsWith("POST:"))  { text = raw; type = "post"; }
    else                               { text = safeDecrypt(raw); }
    const senderId = m.sender?._id || m.sender || m.from;
    return { _id:m._id, text, type, fileInfo,
      me: String(senderId)===String(meRef.current._id),
      time:m.createdAt, senderName:m.sender?.firstName||m.senderName||"" };
  };

  useEffect(() => {
    setList([]);
    const ep = isGroup ? `/groups/messages/${user.chatId}` : `/chat/${user.chatId}`;
    const fetchMsgs = () => API.get(ep).then(async r => {
      const mapped = await Promise.all((r.data||[]).map(parseMsg));
      setList(withSeps(mapped));
    }).catch(console.error);
    fetchMsgs();
    const poll = setInterval(fetchMsgs, 30000);
    return () => clearInterval(poll);
  }, [user.chatId]);

  useEffect(() => {
    const onReceive = async (m) => {
      if (String(m.from) === String(meRef.current._id)) return;
      if (m.groupId && m.groupId !== user.chatId) return;
      if (!m.groupId && isGroup) return;
      if (m.type === "unsent") {
        if (m.msgId) setList(prev => prev.map(x => x._id===m.msgId ? {...x,text:"Message unsent",type:"unsent",unsent:true} : x));
        return;
      }
      const parsed = await parseMsg({ encrypted:m.encrypted, type:m.type, sender:{_id:m.from,firstName:m.senderName||m.fromName||""}, createdAt:new Date() });
      setList(prev => {
        const d = fmtDate(parsed.time);
        const last = [...prev].reverse().find(x => x.type==="sep");
        const ws = [...prev];
        if (!last || last.label !== d) ws.push({type:"sep",label:d});
        ws.push(parsed); return ws;
      });
      playMessageSound();
      if (document.hidden && Notification.permission==="granted")
        new Notification(displayName, { body:parsed.type==="image"?"Image":parsed.text?.slice(0,50), icon:"/vite.svg" });
    };

    const onMessageUnsent = ({msgId}) =>
      setList(prev => prev.map(m => m._id===msgId ? {...m,text:"Message unsent",type:"unsent",unsent:true} : m));

    const onTyping = (data) => {
      playTypingSound();
      const fromId = data?.from;
      if (isGroup) { if (data?.groupId !== user.chatId) return; }
      else         { if (!fromId || String(fromId) !== String(user._id)) return; }
      setTyping(true); clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(false), 1500);
    };

    messageListeners.add(onReceive);
    if (messageBuffer.length > 0) { [...messageBuffer].forEach(m => onReceive(m)); messageBuffer.length = 0; }
    socket.on("typing", onTyping);
    socket.on("messageUnsent", onMessageUnsent);
    if (Notification.permission === "default") Notification.requestPermission();
    return () => { messageListeners.delete(onReceive); socket.off("typing",onTyping); socket.off("messageUnsent",onMessageUnsent); };
  }, [user.chatId, user._id]);

  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:"smooth"}); }, [list, typing]);
  useEffect(() => { const c = () => setCtxMenu(null); window.addEventListener("click",c); return () => window.removeEventListener("click",c); }, []);

  const send = async () => {
    if (!msg.trim()) return;
    const plaintext = msg; setMsg("");
    const encrypted = encryptMsg(plaintext);
    const res = await API.post(
      isGroup ? "/groups/message" : "/chat",
      isGroup ? {groupId:user.chatId,encrypted,type:"text"} : {chat:user.chatId,encrypted,type:"text"}
    ).catch(console.error);
    socket.emit("send", {encrypted,to:user._id,from:meRef.current._id,chatId:user.chatId,type:"text",isGroup,groupId:isGroup?user.chatId:undefined,msgId:res?.data?._id});
    setList(prev => [...prev, {_id:res?.data?._id,text:plaintext,type:"text",me:true,time:new Date()}]);
    playSentSound();
  };

  const sendFile = async (e) => {
    const file = e.target.files[0]; if (!file) return; setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await API.post("/chat/upload", fd);
      const isImg = file.type.startsWith("image/");
      const payload = isImg ? "IMG:"+res.data.url : "FILE:"+JSON.stringify({url:res.data.url,name:res.data.name||file.name,size:res.data.size||file.size});
      const type = isImg ? "image" : "file";
      const msgRes = await API.post(isGroup?"/groups/message":"/chat", isGroup?{groupId:user.chatId,encrypted:payload,type}:{chat:user.chatId,encrypted:payload,type});
      socket.emit("send",{encrypted:payload,to:user._id,from:meRef.current._id,chatId:user.chatId,type,isGroup,groupId:isGroup?user.chatId:undefined,msgId:msgRes?.data?._id});
      setList(prev => [...prev, isImg
        ? {_id:msgRes?.data?._id,text:res.data.url,type:"image",me:true,time:new Date()}
        : {_id:msgRes?.data?._id,type:"file",me:true,time:new Date(),fileInfo:{name:res.data.name||file.name,size:res.data.size||file.size,url:res.data.url}}
      ]);
    } catch(err) {
      console.error("Upload error:", err?.response?.data || err.message);
      alert("Upload failed: " + (err?.response?.data?.error || err.message || "server error"));
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value=""; }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      audioChunks.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => { if (e.data.size > 0) audioChunks.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunks.current, {type:"audio/webm"});
        if (blob.size < 1000) return;
        setUploading(true);
        try {
          const fd = new FormData(); fd.append("file", blob, "voice.webm");
          const res = await API.post("/chat/upload", fd);
          const payload = "AUDIO:" + res.data.url;
          const msgRes = await API.post(isGroup?"/groups/message":"/chat", isGroup?{groupId:user.chatId,encrypted:payload,type:"audio"}:{chat:user.chatId,encrypted:payload,type:"audio"});
          socket.emit("send",{encrypted:payload,to:user._id,from:meRef.current._id,chatId:user.chatId,type:"audio",isGroup,groupId:isGroup?user.chatId:undefined,msgId:msgRes?.data?._id});
          setList(prev => [...prev, {_id:msgRes?.data?._id,text:res.data.url,type:"audio",me:true,time:new Date()}]);
        } catch(err) {
          console.error("Voice upload error:", err?.response?.data || err.message);
          alert("Voice send failed");
        } finally { setUploading(false); }
      };
      mr.start();
      mediaRecRef.current = mr;
      setRecording(true); setRecSecs(0);
      recTimer.current = setInterval(() => setRecSecs(s => s+1), 1000);
    } catch { alert("Microphone access denied"); }
  };

  const stopRecording = () => {
    clearInterval(recTimer.current);
    mediaRecRef.current?.stop();
    setRecording(false); setRecSecs(0);
  };

  const unsendMsg = async (msgId, time) => {
    if (!canUnsend(time)) { alert("Can only unsend within 1 hour"); setCtxMenu(null); return; }
    try {
      await API.delete(isGroup ? `/groups/message/${msgId}` : `/chat/message/${msgId}`);
      setList(prev => prev.map(m => m._id===msgId ? {...m,text:"Message unsent",type:"unsent",unsent:true} : m));
      socket.emit("unsend",{msgId,to:user._id,from:meRef.current._id,isGroup,groupId:isGroup?user.chatId:undefined});
    } catch (e) { alert(e.response?.data?.msg||"Cannot unsend"); }
    setCtxMenu(null);
  };

  const clearChat = async () => {
    if (!confirm("Clear chat history? This only clears for you.")) return;
    try { await API.post(`/chat/clear/${user.chatId}`); setList([]); }
    catch { alert("Failed to clear chat"); }
  };

  const uploadGroupPhoto = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const fd = new FormData(); fd.append("avatar", file);
      const res = await API.post(`/groups/avatar/${user.chatId}`, fd);
      setGroupData(prev => ({...prev, avatar: res.data.avatar}));
    } catch (e) { alert(e.response?.data?.msg || "Failed to upload photo"); }
    if (groupPhotoRef.current) groupPhotoRef.current.value = "";
  };

  const removeMember = async (memberId) => {
    try {
      await API.post(`/groups/remove-member/${user.chatId}`, {memberId});
      setGroupData(prev => ({...prev, members: prev.members.filter(m => String(m._id) !== String(memberId))}));
    } catch (e) { alert(e.response?.data?.msg || "Failed"); }
  };

  const addMember = async (userId) => {
    try {
      const res = await API.post(`/groups/add-member/${user.chatId}`, {memberId:userId});
      setGroupData(res.data); setAddingUser("");
    } catch (e) { alert(e.response?.data?.msg || "Failed"); }
  };

  const leaveGroup = async () => {
    if (!confirm("Leave this group?")) return;
    try { await API.post(`/groups/leave/${user.chatId}`); window.location.reload(); }
    catch (e) { alert(e.response?.data?.msg || "Failed"); }
  };

  const deleteGroup = async () => {
    if (!confirm("Delete this group for everyone?")) return;
    try { await API.delete(`/groups/delete/${user.chatId}`); window.location.reload(); }
    catch (e) { alert(e.response?.data?.msg || "Only admin can delete"); }
  };

  const nonMembers = allUsers.filter(u =>
    !members.map(m => String(m._id)).includes(String(u._id)) &&
    String(u._id) !== String(meRef.current._id)
  );

  const hdrBtn = (extraStyle={}) => ({
    width:36, height:36, borderRadius:"50%",
    border:"1px solid rgba(255,255,255,.1)",
    background:"rgba(255,255,255,.05)",
    cursor:"pointer", display:"flex", alignItems:"center",
    justifyContent:"center", color:"rgba(255,255,255,.7)",
    transition:"all .2s", marginLeft:4, ...extraStyle,
  });

  return (
    <div className="chat" onClick={() => setCtxMenu(null)}
      style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, overflow: "hidden" }}>

      {/* Header */}
      <div className="chat-header">
        {/* ── Back button — mobile only ── */}
        {isMobile && onBack && (
          <button onClick={onBack} style={{
            width: 34, height: 34, borderRadius: "50%", border: "none",
            background: "rgba(255,255,255,0.07)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", flexShrink: 0, marginRight: 2,
            transition: "background .2s",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        )}
        <div className={`chat-header-avatar ${isGroup?"group-hav":""}`}
          style={{cursor:isGroup?"pointer":"default"}}
          onClick={() => isGroup && setShowInfo(s=>!s)}>
          {!isGroup && user.avatar
            ? <img src={imgSrc(user.avatar)} alt=""/>
            : isGroup
              ? (groupData?.avatar
                  ? <img src={imgSrc(groupData.avatar)} alt="" style={{width:"100%",height:"100%",borderRadius:"50%",objectFit:"cover"}}/>
                  : <span style={{fontSize:18}}>👥</span>)
              : <span>{displayName[0]?.toUpperCase()}</span>
          }
          {isOnline && <div className="online-dot"/>}
        </div>

        <div style={{flex:1}}>
          <div className="chat-header-name"
            style={{cursor:!isGroup?"pointer":"default"}}
            onClick={() => !isGroup && onViewProfile && onViewProfile(user)}>
            {displayName}
            {!isGroup && <span style={{fontSize:12,color:"var(--accent2)",fontWeight:400,marginLeft:6}}>profile</span>}
          </div>
          <div className="chat-header-status">
            {isGroup
              ? `${members.length} members · ${isAdmin?"You are admin":"Click avatar for info"}`
              : `${isOnline?"Active now":"Offline"}${user.username?` · @${user.username}`:""} · E2E`}
          </div>
        </div>

        {!isGroup && (<>
          <button style={hdrBtn()} title="Voice call"
            onClick={() => onStartCall && onStartCall(user,"voice")}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(108,99,255,.25)";e.currentTarget.style.color="#a78bfa";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.05)";e.currentTarget.style.color="rgba(255,255,255,.7)";}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.27 15z"/></svg>
          </button>
          <button style={hdrBtn()} title="Video call"
            onClick={() => onStartCall && onStartCall(user,"video")}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(108,99,255,.25)";e.currentTarget.style.color="#a78bfa";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.05)";e.currentTarget.style.color="rgba(255,255,255,.7)";}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
          </button>
          <button style={hdrBtn()} title="Clear chat (only for you)" onClick={clearChat}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(239,68,68,.2)";e.currentTarget.style.color="#ef4444";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.05)";e.currentTarget.style.color="rgba(255,255,255,.7)";}}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </>)}

        {isGroup && (<>
          <button style={hdrBtn()} title="Group voice call"
            onClick={() => onStartCall && onStartCall(user, "voice")}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(108,99,255,.25)";e.currentTarget.style.color="#a78bfa";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.05)";e.currentTarget.style.color="rgba(255,255,255,.7)";}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.27 15z"/></svg>
          </button>
          <button style={hdrBtn()} title="Group info" onClick={() => setShowInfo(s=>!s)}
            onMouseEnter={e=>{e.currentTarget.style.background="rgba(108,99,255,.25)";e.currentTarget.style.color="#a78bfa";}}
            onMouseLeave={e=>{e.currentTarget.style.background="rgba(255,255,255,.05)";e.currentTarget.style.color="rgba(255,255,255,.7)";}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </button>
        </>)}
      </div>

      {/* Group info panel */}
      {isGroup && showInfo && (
        <div className="group-info-panel">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <div style={{position:"relative",flexShrink:0}}>
                <div style={{ width:54,height:54,borderRadius:"50%",overflow:"hidden",
                  background:"linear-gradient(135deg,#7c3aed,#4f46e5)",
                  display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,
                  border:"2px solid rgba(255,255,255,0.1)" }}>
                  {groupData?.avatar
                    ? <img src={imgSrc(groupData.avatar)} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    : "👥"}
                </div>
                {isAdmin && (
                  <button onClick={() => groupPhotoRef.current?.click()} title="Change group photo"
                    style={{ position:"absolute",bottom:-2,right:-2,width:22,height:22,borderRadius:"50%",
                      background:"#7c6bfa",border:"2px solid #080b14",
                      cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  </button>
                )}
              </div>
              <input ref={groupPhotoRef} type="file" accept="image/*" style={{display:"none"}} onChange={uploadGroupPhoto}/>
              <div>
                <div className="group-info-title">{user.name}</div>
                <div className="group-info-admin">
                  Admin: {[groupData?.admin?.firstName,groupData?.admin?.lastName].filter(Boolean).join(" ") || groupData?.admin?.username || "—"}
                </div>
              </div>
            </div>
            <div style={{display:"flex",gap:6}}>
              <button onClick={leaveGroup} style={{padding:"6px 12px",borderRadius:8,border:"1px solid var(--warning)",background:"transparent",color:"var(--warning)",fontSize:12,cursor:"pointer",fontWeight:600}}>Leave</button>
              {isAdmin && <button onClick={deleteGroup} style={{padding:"6px 12px",borderRadius:8,border:"1px solid var(--danger)",background:"transparent",color:"var(--danger)",fontSize:12,cursor:"pointer",fontWeight:600}}>Delete</button>}
            </div>
          </div>

          {isAdmin && nonMembers.length > 0 && (
            <div style={{marginBottom:10,display:"flex",gap:8,alignItems:"center"}}>
              <select value={addingUser} onChange={e=>setAddingUser(e.target.value)}
                style={{flex:1,padding:"7px 10px",borderRadius:10,border:"1px solid var(--border)",background:"var(--surface2)",color:"var(--text)",fontSize:13,outline:"none"}}>
                <option value="">Select user to add...</option>
                {nonMembers.map(u=>(
                  <option key={u._id} value={u._id}>{[u.firstName,u.lastName].filter(Boolean).join(" ")||u.username}</option>
                ))}
              </select>
              {addingUser && <button onClick={()=>addMember(addingUser)} style={{padding:"7px 14px",borderRadius:10,border:"none",background:"var(--accent-g)",color:"#fff",fontSize:13,cursor:"pointer",fontWeight:600}}>Add</button>}
            </div>
          )}

          <div className="group-info-members-label">MEMBERS ({members.length})</div>
          <div className="group-members-list">
            {members.map(m => {
              const name=[m.firstName,m.lastName].filter(Boolean).join(" ")||m.username||"User";
              const mIsAdmin=String(m._id)===adminId;
              return (
                <div key={m._id} className="group-member-item">
                  <div className="tile-avatar" style={{width:30,height:30,fontSize:12,flexShrink:0,borderRadius:"50%"}}>
                    {m.avatar ? <img src={imgSrc(m.avatar)} alt=""/> : name[0]?.toUpperCase()}
                  </div>
                  <span style={{flex:1,fontSize:13,fontWeight:500}}>{name}</span>
                  {mIsAdmin && <span className="badge admin">Admin</span>}
                  {isAdmin && !mIsAdmin && (
                    <button onClick={()=>removeMember(m._id)} style={{padding:"3px 8px",borderRadius:6,border:"1px solid var(--danger)",background:"transparent",color:"var(--danger)",fontSize:11,cursor:"pointer",marginLeft:6}}>Remove</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="messages" style={{ WebkitOverflowScrolling: "touch", overflowY: "auto", flex: 1, minHeight: 0 }}>
        {list.map((m,i) => {
          if (m.type==="sep") return <div key={`s${i}`} className="date-sep"><span>{m.label}</span></div>;
          return (
            <div key={m._id||i} className={`bubble ${m.me?"me":"them"} ${m.unsent?"unsent-bubble":""}`}
              onContextMenu={e=>{e.preventDefault();e.stopPropagation();if(m.me&&m._id&&!m.unsent)setCtxMenu({msgId:m._id,x:e.clientX,y:e.clientY,time:m.time});}}>
              {isGroup && !m.me && m.senderName && <div className="bubble-sender">{m.senderName}</div>}
              {m.unsent
                ? <div className="bubble-text" style={{opacity:.5,fontStyle:"italic"}}>Message unsent</div>
                : m.type==="image"
                  ? <img src={imgSrc(m.text)} alt="" className="chat-image" onClick={()=>window.open(imgSrc(m.text),"_blank")}/>
                  : m.type==="audio"
                    ? <VoicePlayer src={imgSrc(m.text)} isMe={m.me} />
                    : m.type==="file"
                      ? <a href={imgSrc(m.fileInfo?.url)} target="_blank" rel="noreferrer" className="file-bubble">
                          <div className="file-info">
                            <div className="file-name">{m.fileInfo?.name||"File"}</div>
                            <div className="file-size">{fmtSize(m.fileInfo?.size)} · Click to open</div>
                          </div>
                        </a>
                      : m.type==="post"
                        ? (() => {
                            try {
                              const raw = m.text || "";
                              const d = JSON.parse(raw.startsWith("POST:") ? raw.slice(5) : raw);
                              return (
                                <div style={{ minWidth:200, maxWidth:260 }}>
                                  <div style={{ fontSize:11, color:"rgba(255,255,255,.4)", marginBottom:6, display:"flex", alignItems:"center", gap:4 }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                                    Shared a post
                                  </div>
                                  <div style={{ borderRadius:10, overflow:"hidden", border:"1px solid rgba(255,255,255,.1)", background:"rgba(255,255,255,.04)" }}>
                                    {d.mediaUrl && (
                                      <img src={imgSrc(d.mediaUrl)} alt="" style={{ width:"100%", maxHeight:160, objectFit:"cover", display:"block" }}
                                        onClick={() => window.open(imgSrc(d.mediaUrl),"_blank")} />
                                    )}
                                    <div style={{ padding:"8px 10px" }}>
                                      <div style={{ fontSize:12, fontWeight:600, color:"rgba(255,255,255,.7)", marginBottom:2 }}>{d.author}</div>
                                      {d.caption && <div style={{ fontSize:12, color:"rgba(255,255,255,.5)", overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{d.caption}</div>}
                                    </div>
                                  </div>
                                </div>
                              );
                            } catch { return <div className="bubble-text">{m.text}</div>; }
                          })()
                        : <div className="bubble-text">{m.text}</div>
              }
              {!m.unsent && <div className="bubble-time">{fmt(m.time)}{m.me&&" ✔✔"}</div>}
            </div>
          );
        })}
        {typing && <div className="typing-indicator"><span/><span/><span/></div>}
        <div ref={bottomRef}/>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div className="ctx-menu" style={{position:"fixed",left:ctxMenu.x,top:ctxMenu.y,zIndex:999}} onClick={e=>e.stopPropagation()}>
          {canUnsend(ctxMenu.time)
            ? <button onClick={()=>unsendMsg(ctxMenu.msgId,ctxMenu.time)}>Unsend</button>
            : <button disabled style={{opacity:.45,cursor:"not-allowed"}}>1 hour limit passed</button>
          }
          <button onClick={()=>setCtxMenu(null)} style={{color:"var(--muted)"}}>Cancel</button>
        </div>
      )}

      {/* Input bar */}
      <div className="input-bar" style={{ flexShrink: 0, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <input ref={fileRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.zip" style={{display:"none"}} onChange={sendFile}/>

        {!recording && (
          <button className="ib-btn" title="Photo / File" onClick={()=>fileRef.current.click()}>
            {uploading
              ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{animation:"spin 1s linear infinite"}}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
            }
          </button>
        )}

        {recording && (
          <div className="rec-pill">
            <span className="rec-dot"/>
            <span className="rec-time">
              {String(Math.floor(recSecs/60)).padStart(2,"0")}:{String(recSecs%60).padStart(2,"0")}
            </span>
            <button className="rec-stop" onMouseUp={stopRecording} onTouchEnd={stopRecording} title="Stop & send">
              <svg width="9" height="9" viewBox="0 0 10 10" fill="#fff"><rect width="10" height="10" rx="2"/></svg>
            </button>
          </div>
        )}

        <div className="ib-input-wrap">
          <input
            value={msg}
            placeholder={recording ? `Recording... ${recSecs}s` : `Message ${displayName}...`}
            disabled={recording}
            onChange={e=>{setMsg(e.target.value);socket.emit("typing",isGroup?{groupId:user.chatId,userId:meRef.current._id}:user._id);}}
            onKeyDown={e=>e.key==="Enter"&&send()}
          />
          {!msg.trim() && !recording && (
            <button className="ib-mic" title="Hold to record"
              onMouseDown={startRecording} onTouchStart={startRecording}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </button>
          )}
        </div>

        {msg.trim() || recording ? (
          <button className="ib-send" onClick={send} disabled={recording}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        ) : (
          <button className="ib-btn" title="Camera">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}