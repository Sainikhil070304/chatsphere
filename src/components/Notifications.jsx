// Notifications.jsx — Pending connection requests panel
// Real-time: socket "newRequest" event triggers refresh
import { useState, useEffect } from "react";
import API from "../services/api";

const imgSrc = s => s?.startsWith("http") ? s : `http://localhost:5000${s}`;

export default function Notifications({ currentUser, socket, onOpenProfile }) {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [acting,   setActing]   = useState({});

  const load = async () => {
    try {
      const res = await API.get("/connections/pending");
      setRequests(res.data || []);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Real-time new request notification
  useEffect(() => {
    if (!socket) return;
    const onNew = (data) => { load(); };
    socket.on("newRequest", onNew);
    return () => socket.off("newRequest", onNew);
  }, [socket]);

  const handle = async (requestId, action, senderId) => {
    setActing(prev => ({ ...prev, [requestId]: true }));
    try {
      if (action === "accept") {
        await API.post(`/connections/accept/${requestId}`);
        socket?.emit("requestAccepted", { to: senderId });
      } else {
        await API.post(`/connections/reject/${requestId}`);
      }
      setRequests(prev => prev.filter(r => r._id !== requestId));
    } catch(e) { console.error(e); }
    finally { setActing(prev => ({ ...prev, [requestId]: false })); }
  };

  if (loading) return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:"rgba(255,255,255,.4)" }}>
      <div style={{ fontSize:28, animation:"spin 1s linear infinite" }}>⟳</div>
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:"auto", background:"#080b14" }}>
      <div style={{ padding:"20px 18px" }}>
        <h2 style={{ fontFamily:"'Syne',sans-serif", fontSize:19, fontWeight:800, color:"#fff", margin:"0 0 4px" }}>Connection Requests</h2>
        <p style={{ color:"rgba(255,255,255,.35)", fontSize:13, margin:"0 0 20px" }}>Accept requests to start chatting</p>

        {requests.length === 0 ? (
          <div style={{ textAlign:"center", padding:"48px 20px", background:"rgba(255,255,255,.02)", borderRadius:16, border:"1px solid rgba(255,255,255,.06)" }}>
            <div style={{ fontSize:40, marginBottom:10 }}>📭</div>
            <div style={{ color:"rgba(255,255,255,.5)", fontSize:15, fontWeight:600 }}>No pending requests</div>
            <div style={{ color:"rgba(255,255,255,.3)", fontSize:13, marginTop:6 }}>When someone sends you a request, it'll appear here</div>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {requests.map(r => {
              const sender  = r.sender;
              const name    = [sender.firstName, sender.lastName].filter(Boolean).join(" ") || sender.username;
              const busy    = acting[r._id];
              return (
                <div key={r._id} style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", background:"rgba(255,255,255,.04)", borderRadius:16, border:"1px solid rgba(255,255,255,.07)" }}>
                  {/* Avatar */}
                  <div onClick={() => onOpenProfile?.(sender.username)} style={{ width:46, height:46, borderRadius:"50%", overflow:"hidden", background:"linear-gradient(135deg,#6c63ff,#a78bfa)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, color:"#fff", flexShrink:0, cursor:"pointer" }}>
                    {sender.avatar ? <img src={imgSrc(sender.avatar)} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : name[0]?.toUpperCase()}
                  </div>

                  {/* Info */}
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:"#fff", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</div>
                    <div style={{ fontSize:12, color:"rgba(255,255,255,.4)" }}>@{sender.username} wants to connect</div>
                  </div>

                  {/* Actions */}
                  <div style={{ display:"flex", gap:8, flexShrink:0 }}>
                    <button onClick={() => handle(r._id, "accept", sender._id)} disabled={busy}
                      style={{ padding:"8px 16px", borderRadius:10, border:"none", background:"linear-gradient(135deg,#6c63ff,#a78bfa)", color:"#fff", fontSize:13, fontWeight:700, cursor:busy?"not-allowed":"pointer", opacity:busy?.6:1, fontFamily:"'DM Sans',sans-serif" }}>
                      {busy ? "..." : "Accept"}
                    </button>
                    <button onClick={() => handle(r._id, "reject", sender._id)} disabled={busy}
                      style={{ padding:"8px 14px", borderRadius:10, border:"1px solid rgba(239,68,68,.3)", background:"rgba(239,68,68,.08)", color:"#ef4444", fontSize:13, fontWeight:700, cursor:busy?"not-allowed":"pointer", opacity:busy?.6:1, fontFamily:"'DM Sans',sans-serif" }}>
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
