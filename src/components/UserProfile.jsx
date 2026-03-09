// UserProfile.jsx — Connection Request system
// OOP: ProfileViewModel | DSA: State machine (none→pending_sent→connected)
import { useState, useEffect, useCallback } from "react";
import API from "../services/api";

const imgSrc  = s => s?.startsWith("http") ? s : `http://localhost:5000${s}`;
const timeAgo = t => { const d=Math.floor((Date.now()-new Date(t))/86400000); return d===0?"Today":d===1?"Yesterday":`${d}d ago`; };

// OOP: ProfileViewModel encapsulates display logic
class ProfileViewModel {
  constructor(profile, connData, isMe) {
    this.profile = profile;
    this.status  = connData.status || "none";    // none|pending_sent|pending_received|connected
    this.requestId = connData.requestId || null;
    this.isMe    = isMe;
  }
  get canSeePosts() { return this.isMe || this.status === "connected"; }
  get canChat()     { return this.status === "connected"; }
}

export default function UserProfile({ username, onBack, onStartChat, currentUser, socket }) {
  const [vm,      setVm]      = useState(null);
  const [posts,   setPosts]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting,  setActing]  = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [toast,   setToast]   = useState("");

  const showToast = (msg, dur = 3000) => { setToast(msg); setTimeout(() => setToast(""), dur); };

  const load = useCallback(async () => {
    if (!username) return;
    setLoading(true);
    try {
      const profRes = await API.get(`/profile/${username}`);
      const profile = profRes.data;
      const isMe    = String(profile._id) === String(currentUser?._id);
      const [connRes, postsRes] = await Promise.all([
        isMe ? Promise.resolve({ data: { status: "connected" } }) : API.get(`/connections/status/${profile._id}`),
        API.get(`/posts/user/${username}`).catch(() => ({ data: [] })),
      ]);
      setVm(new ProfileViewModel(profile, connRes.data, isMe));
      setPosts(postsRes.data || []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [username, currentUser]);

  useEffect(() => { load(); }, [load]);

  // Real-time: refresh when they accept our request
  useEffect(() => {
    if (!socket) return;
    const onAccepted = (d) => {
      if (vm && String(d.from) === String(vm.profile._id)) { showToast("🎉 Request accepted!"); load(); }
    };
    socket.on("requestAccepted", onAccepted);
    return () => socket.off("requestAccepted", onAccepted);
  }, [socket, vm, load]);

  const act = async (key) => {
    if (key === "message")     { onStartChat?.(vm.profile); return; }
    if (key === "disconnect" || key === "unping") { setConfirm(key); return; }
    setActing(true);
    try {
      if (key === "send") {
        await API.post(`/connections/send/${vm.profile._id}`);
        socket?.emit("newRequest", { to: vm.profile._id, fromName: currentUser?.firstName || currentUser?.username });
        showToast("Request sent! ✉️");
      } else if (key === "cancel") {
        await API.delete(`/connections/cancel/${vm.profile._id}`);
        showToast("Request cancelled");
      } else if (key === "accept") {
        const res = await API.post(`/connections/accept/${vm.requestId}`);
        socket?.emit("requestAccepted", { to: vm.profile._id });
        showToast(res.data.msg || "Connected! 🎉");
      } else if (key === "reject") {
        await API.post(`/connections/reject/${vm.requestId}`);
        showToast("Request declined");
      }
      await load();
    } catch(e) { showToast(e.response?.data?.msg || "Action failed"); }
    finally { setActing(false); }
  };

  const doConfirm = async () => {
    const a = confirm; setConfirm(null); setActing(true);
    try {
      if (a === "disconnect") { await API.delete(`/connections/disconnect/${vm.profile._id}`); showToast("Disconnected"); }
      if (a === "unping")     { await API.post(`/posts/unping/${vm.profile._id}`); showToast("User unpinged. Messages deleted."); }
      await load();
    } catch(e) { showToast(e.response?.data?.msg || "Failed"); }
    finally { setActing(false); }
  };

  if (loading) return (
    <div style={styles.center}>
      <div style={{ fontSize:32, animation:"spin 1s linear infinite" }}>⟳</div>
      <div style={{ marginTop:10, color:"rgba(255,255,255,.4)", fontSize:14 }}>Loading profile...</div>
    </div>
  );
  if (!vm) return (
    <div style={styles.center}>
      <div style={{ fontSize:48 }}>🔍</div>
      <div style={{ color:"rgba(255,255,255,.4)", marginTop:8 }}>Profile not found</div>
      <button onClick={onBack} style={styles.backBtn}>← Back</button>
    </div>
  );

  const p       = vm.profile;
  const name    = [p.firstName, p.lastName].filter(Boolean).join(" ") || p.username;
  const status  = vm.status;

  return (
    <div style={{ flex:1, overflowY:"auto", background:"#080b14" }}>

      {/* ── Hero ── */}
      <div style={{ height:120, background:"linear-gradient(135deg,rgba(108,99,255,.4),rgba(167,139,250,.12))", position:"relative" }}>
        <button onClick={onBack} style={{ position:"absolute", top:14, left:14, padding:"7px 14px", borderRadius:10, border:"1px solid rgba(255,255,255,.15)", background:"rgba(0,0,0,.35)", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Sans',sans-serif" }}>
          ← Back
        </button>
      </div>

      <div style={{ maxWidth:560, margin:"0 auto", padding:"0 18px 56px" }}>

        {/* ── Avatar row ── */}
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginTop:-40, marginBottom:14 }}>
          <div style={{ width:82, height:82, borderRadius:"50%", border:"4px solid #080b14", overflow:"hidden", background:"linear-gradient(135deg,#6c63ff,#a78bfa)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:30, flexShrink:0 }}>
            {p.avatar ? <img src={imgSrc(p.avatar)} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : <span style={{ color:"#fff" }}>{name[0]?.toUpperCase()}</span>}
          </div>

          {/* ── Action buttons ── */}
          {!vm.isMe && (
            <div style={{ display:"flex", gap:8, paddingBottom:4, flexWrap:"wrap", justifyContent:"flex-end" }}>
              {/* NONE: send request */}
              {status === "none" && (
                <ActionBtn onClick={() => act("send")} disabled={acting} variant="primary">➕ Send Request</ActionBtn>
              )}

              {/* PENDING SENT: cancel */}
              {status === "pending_sent" && (
                <ActionBtn onClick={() => act("cancel")} disabled={acting} variant="pending">⏳ Pending · Cancel</ActionBtn>
              )}

              {/* PENDING RECEIVED: accept/decline */}
              {status === "pending_received" && (<>
                <ActionBtn onClick={() => act("accept")} disabled={acting} variant="accept">✓ Accept</ActionBtn>
                <ActionBtn onClick={() => act("reject")} disabled={acting} variant="danger">✕ Decline</ActionBtn>
              </>)}

              {/* CONNECTED: message + disconnect + unping */}
              {status === "connected" && (<>
                <ActionBtn onClick={() => act("message")} variant="outline">💬 Message</ActionBtn>
                <ActionBtn onClick={() => act("disconnect")} disabled={acting} variant="ghost">Disconnect</ActionBtn>
                <ActionBtn onClick={() => act("unping")} disabled={acting} variant="danger-ghost">🔕</ActionBtn>
              </>)}
            </div>
          )}
        </div>

        {/* ── Identity ── */}
        <h1 style={{ fontFamily:"'Syne',sans-serif", fontSize:20, fontWeight:800, margin:"0 0 2px", color:"#fff" }}>{name}</h1>
        <div style={{ color:"rgba(255,255,255,.4)", fontSize:13, marginBottom: p.bio ? 8 : 14 }}>@{p.username}{p.isAdmin ? " · 🛡️ Admin":""}</div>
        {p.bio && <div style={{ fontSize:14, color:"rgba(255,255,255,.7)", lineHeight:1.6, marginBottom:14 }}>{p.bio}</div>}

        {/* ── Status pill ── */}
        <StatusPill status={status} />

        {/* ── Stats ── */}
        <div style={{ display:"flex", gap:28, marginBottom:18, paddingBottom:16, borderBottom:"1px solid rgba(255,255,255,.07)" }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontWeight:800, fontSize:17, color:"#fff" }}>{posts.length}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,.35)" }}>Posts</div>
          </div>
        </div>

        {/* ── Posts ── */}
        {!vm.canSeePosts ? (
          <LockCard status={status} name={p.username} />
        ) : posts.length === 0 ? (
          <div style={{ textAlign:"center", padding:"40px 0", color:"rgba(255,255,255,.3)" }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📷</div>No posts yet
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:3 }}>
            {posts.filter(p=>p.media?.length).map(p => (
              <div key={p._id} style={{ aspectRatio:"1", overflow:"hidden", borderRadius:6, position:"relative", background:"rgba(255,255,255,.05)" }}>
                <img src={imgSrc(p.media[0].url)} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                {p.likes?.length > 0 && <div style={{ position:"absolute", bottom:4, left:4, fontSize:11, color:"#fff", background:"rgba(0,0,0,.6)", borderRadius:4, padding:"1px 5px" }}>❤ {p.likes.length}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Confirm dialog ── */}
      {confirm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", backdropFilter:"blur(8px)" }}>
          <div style={{ background:"#12152a", border:"1px solid rgba(255,255,255,.1)", borderRadius:20, padding:28, maxWidth:320, width:"90%", textAlign:"center" }}>
            <div style={{ fontSize:36, marginBottom:10 }}>{confirm==="unping"?"🔕":"🔗"}</div>
            <h3 style={{ fontFamily:"'Syne',sans-serif", fontSize:16, fontWeight:800, color:"#fff", marginBottom:8 }}>
              {confirm==="unping" ? "Unping this user?" : "Disconnect?"}
            </h3>
            <p style={{ color:"rgba(255,255,255,.45)", fontSize:13, lineHeight:1.6, marginBottom:20 }}>
              {confirm==="unping"
                ? "This deletes ALL messages and blocks them permanently."
                : "You'll need to send a new request to chat again."}
            </p>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setConfirm(null)} style={{ flex:1, padding:"11px", borderRadius:11, border:"1px solid rgba(255,255,255,.12)", background:"transparent", color:"#fff", fontSize:14, fontWeight:600, cursor:"pointer" }}>Cancel</button>
              <button onClick={doConfirm} style={{ flex:1, padding:"11px", borderRadius:11, border:"none", background: confirm==="unping"?"#ef4444":"#f97316", color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>
                {confirm==="unping" ? "Unping":"Disconnect"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div style={{ position:"fixed", bottom:28, left:"50%", transform:"translateX(-50%)", background:"rgba(15,18,32,.97)", border:"1px solid rgba(108,99,255,.4)", color:"#fff", padding:"10px 22px", borderRadius:12, fontSize:14, fontWeight:600, zIndex:9999, boxShadow:"0 8px 28px rgba(0,0,0,.5)", whiteSpace:"nowrap", animation:"fadeUp .2s ease" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function ActionBtn({ onClick, disabled, children, variant="outline" }) {
  const s = {
    primary:      { background:"linear-gradient(135deg,#6c63ff,#a78bfa)", color:"#fff", border:"none" },
    pending:      { background:"rgba(249,115,22,.12)", color:"#f97316",  border:"1px solid rgba(249,115,22,.3)" },
    accept:       { background:"#22c55e", color:"#fff", border:"none" },
    danger:       { background:"rgba(239,68,68,.12)", color:"#ef4444",   border:"1px solid rgba(239,68,68,.3)" },
    outline:      { background:"transparent", color:"#fff",              border:"1px solid rgba(255,255,255,.2)" },
    ghost:        { background:"transparent", color:"rgba(255,255,255,.5)", border:"1px solid rgba(255,255,255,.1)" },
    "danger-ghost":{ background:"transparent", color:"#ef4444",          border:"1px solid rgba(239,68,68,.25)" },
  }[variant] || {};
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding:"8px 16px", borderRadius:10, fontSize:13, fontWeight:700, cursor:disabled?"not-allowed":"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all .15s", opacity:disabled?.6:1, ...s }}>
      {disabled ? "..." : children}
    </button>
  );
}

function StatusPill({ status }) {
  const map = {
    connected:         { color:"#22c55e", bg:"rgba(34,197,94,.1)",   icon:"🔗", text:"Connected" },
    pending_sent:      { color:"#f97316", bg:"rgba(249,115,22,.1)",  icon:"⏳", text:"Request sent — waiting for response" },
    pending_received:  { color:"#a78bfa", bg:"rgba(167,139,250,.1)", icon:"📩", text:"They want to connect with you!" },
  };
  const c = map[status];
  if (!c) return null;
  return (
    <div style={{ display:"inline-flex", alignItems:"center", gap:7, padding:"6px 14px", borderRadius:20, background:c.bg, border:`1px solid ${c.color}33`, marginBottom:16, fontSize:13, color:c.color, fontWeight:600 }}>
      <span>{c.icon}</span><span>{c.text}</span>
    </div>
  );
}

function LockCard({ status, name }) {
  const [icon, title, body] =
    status === "pending_sent"
      ? ["⏳", "Request Pending", `Waiting for @${name} to accept your request.`]
      : ["🔒", "Connect to see posts", `Send a connection request to @${name} to see their posts and start chatting.`];
  return (
    <div style={{ textAlign:"center", padding:"36px 20px", background:"rgba(255,255,255,.03)", borderRadius:16, border:"1px solid rgba(255,255,255,.07)" }}>
      <div style={{ fontSize:40, marginBottom:10 }}>{icon}</div>
      <div style={{ fontSize:15, fontWeight:700, color:"#fff", marginBottom:6 }}>{title}</div>
      <div style={{ fontSize:13, color:"rgba(255,255,255,.4)", lineHeight:1.6 }}>{body}</div>
    </div>
  );
}

const styles = {
  center: { flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", background:"#080b14", color:"#fff" },
  backBtn: { marginTop:16, padding:"8px 18px", borderRadius:10, border:"1px solid rgba(255,255,255,.15)", background:"transparent", color:"#fff", cursor:"pointer" },
};
