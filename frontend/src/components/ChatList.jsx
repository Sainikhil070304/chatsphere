import { useState, useEffect, useRef, useCallback } from "react";
import API from "../services/api";
import { socket } from "../socket";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

// DSA: O(1) name resolution
const userName = (u) =>
  u ? ([u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "?") : "?";

const initials = (name = "") =>
  name.split(" ").map((w) => w[0] || "").join("").toUpperCase().slice(0, 2) || "?";

const Avatar = ({ src, name, size = 42, online }) => (
  <div style={{ position: "relative", flexShrink: 0, width: size, height: size }}>
    {src
      ? <img src={src.startsWith("http") ? src : `${BASE}${src}`} alt={name}
             style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block" }} />
      : <div style={{
          width: size, height: size, borderRadius: "50%",
          background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size * 0.38, fontWeight: 700, color: "#fff",
        }}>{initials(name)}</div>}
    {online !== undefined && (
      <span style={{
        position: "absolute", bottom: 1, right: 1,
        width: 10, height: 10, borderRadius: "50%",
        background: online ? "#22c55e" : "rgba(255,255,255,0.2)",
        border: "2px solid #0f0f1a",
      }} />
    )}
  </div>
);

// DSA: build chat object for App — O(1) member lookup via find()
function buildChatObj(raw, currentUser) {
  if (raw.isGroup) {
    return {
      _id: raw._id, chatId: raw._id,
      name: raw.name, avatar: raw.photo || raw.avatar || "",
      isGroup: true, members: raw.members || [], admin: raw.admin,
    };
  }
  const other =
    (raw.memberDetails || raw.members || []).find(
      (m) => String(m._id || m) !== String(currentUser._id)
    ) || {};
  return {
    _id: String(other._id || raw._id), chatId: raw._id,
    name: userName(other),
    username: other.username || "",
    avatar: other.avatar || "",
    isGroup: false,
  };
}

export default function ChatList({ open, currentUser, onlineUsers = [] }) {
  const [tab,           setTab]           = useState("dms");
  const [dms,           setDms]           = useState([]);
  const [groups,        setGroups]        = useState([]);
  const [allUsers,      setAllUsers]      = useState([]);
  const [search,        setSearch]        = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [showNewGroup,  setShowNewGroup]  = useState(false);
  const [groupName,     setGroupName]     = useState("");
  const [groupMembers,  setGroupMembers]  = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [selectedId,    setSelectedId]    = useState(null);
  const searchTimer = useRef(null);

  // DSA: HashMap for O(1) dedup of DM chats by chatId
  const dmMap = useRef(new Map());

  const loadDms = useCallback(async () => {
    try {
      const { data } = await API.get("/chat");
      if (!Array.isArray(data)) return;
      dmMap.current.clear();
      data.forEach(chat => {
        const key = (chat.members || [])
          .map(m => String(m._id || m))
          .sort()
          .join(":");
        const existing = dmMap.current.get(key);
        if (!existing || new Date(chat.updatedAt) > new Date(existing.updatedAt)) {
          dmMap.current.set(key, chat);
        }
      });
      setDms([...dmMap.current.values()]);
    } catch (err) { console.error("Load DMs:", err); }
  }, []);

  const loadGroups = useCallback(async () => {
    try {
      const { data } = await API.get("/groups");
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) { console.error("Load groups:", err); }
  }, []);

  const loadAllUsers = useCallback(async () => {
    try {
      const { data } = await API.get("/user");
      const sorted = (Array.isArray(data) ? data : [])
        .filter((u) => String(u._id) !== String(currentUser._id))
        .sort((a, b) => userName(a).toLowerCase().localeCompare(userName(b).toLowerCase()));
      setAllUsers(sorted);
    } catch (err) { console.error("Load users:", err); }
  }, [currentUser._id]);

  useEffect(() => { loadDms(); loadGroups(); loadAllUsers(); }, [loadDms, loadGroups, loadAllUsers]);

  // DSA: Real-time in-place update — O(1) HashMap update, no full re-fetch
  useEffect(() => {
    const onReceive = (msg) => {
      if (msg.isGroup || msg.groupId) {
        setGroups(prev => prev.map(g =>
          String(g._id) === String(msg.groupId)
            ? { ...g, lastMessage: "💬 Message", updatedAt: new Date() }
            : g
        ));
      } else {
        setDms(prev => {
          const updated = prev.map(d => {
            const members = d.members || [];
            const involved = members.some(m =>
              String(m._id || m) === String(msg.from) ||
              String(m._id || m) === String(currentUser._id)
            );
            return involved ? { ...d, lastMessage: "💬 Message", updatedAt: new Date() } : d;
          });
          return [...updated].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        });
      }
    };
    socket.on("receive", onReceive);
    return () => socket.off("receive", onReceive);
  }, [currentUser._id]);

  // Search with debounce
  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimer.current);
    if (!val.trim()) { setSearchResults(null); return; }
    searchTimer.current = setTimeout(async () => {
      try {
        const { data } = await API.get("/search", { params: { q: val } });
        setSearchResults(Array.isArray(data) ? data : []);
      } catch {
        const q = val.toLowerCase();
        setSearchResults(allUsers.filter((u) =>
          userName(u).toLowerCase().includes(q) ||
          (u.username || "").toLowerCase().includes(q)
        ));
      }
    }, 300);
  };

  const openChat = (raw) => {
    const chatObj = buildChatObj(raw, currentUser);
    setSelectedId(chatObj.chatId);
    open(chatObj);
  };

  const startDm = async (user) => {
    setSearch(""); setSearchResults(null); setLoading(true);
    try {
      const { data } = await API.post("/chat/create", { userId: user._id });
      await loadDms();
      openChat({ ...data, memberDetails: [user, currentUser] });
      setTab("dms");
    } catch (err) { console.error("Start DM:", err); }
    finally { setLoading(false); }
  };

  const createGroup = async () => {
    if (!groupName.trim() || groupMembers.length === 0) return;
    try {
      const { data } = await API.post("/groups/create", {
        name: groupName.trim(), members: groupMembers.map((m) => m._id),
      });
      setGroups((prev) => [data, ...prev]);
      openChat({ ...data, isGroup: true });
      setShowNewGroup(false); setGroupName(""); setGroupMembers([]); setTab("groups");
    } catch (err) { console.error("Create group:", err); }
  };

  const isOnline = (userId) => onlineUsers.includes(String(userId));

  // ── DM item ───────────────────────────────────────────────────────
  const renderDmItem = (chat) => {
    const members = chat.members || [];
    const other =
      members.find((m) => String(m._id || m) !== String(currentUser._id)) ||
      chat.memberDetails?.find((m) => String(m._id) !== String(currentUser._id)) ||
      {};
    const name   = userName(other);
    const avatar = other.avatar || "";
    const online = isOnline(other._id);
    const active = selectedId === chat._id;
    const lastMsg = chat.lastMessage || "";

    return (
      <div key={chat._id} onClick={() => openChat({ ...chat, memberDetails: [other, currentUser] })}
        style={{
          display:"flex", alignItems:"center", gap:12, padding:"10px 12px",
          borderRadius:12, cursor:"pointer", transition:"background 0.15s",
          background: active ? "rgba(124,58,237,0.25)" : "transparent",
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background="rgba(255,255,255,0.05)"; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background="transparent"; }}>
        <Avatar src={avatar} name={name} size={44} online={online} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:600, fontSize:14, color:"#fff",
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</div>
          {lastMsg && (
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)",
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginTop:2 }}>
              {lastMsg.startsWith("U2Fs") ? "🔒 Encrypted" : lastMsg}
            </div>
          )}
        </div>
        {online && <span style={{ width:8, height:8, borderRadius:"50%", background:"#22c55e", flexShrink:0 }} />}
      </div>
    );
  };

  // ── Group item ────────────────────────────────────────────────────
  const renderGroupItem = (group) => {
    const active  = selectedId === group._id;
    const isAdmin = String(group.admin?._id || group.admin) === String(currentUser._id);
    return (
      <div key={group._id} onClick={() => openChat({ ...group, isGroup: true })}
        style={{
          display:"flex", alignItems:"center", gap:12, padding:"10px 12px",
          borderRadius:12, cursor:"pointer", transition:"background 0.15s",
          background: active ? "rgba(124,58,237,0.25)" : "transparent",
        }}
        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background="rgba(255,255,255,0.05)"; }}
        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background="transparent"; }}>
        <Avatar src={group.photo || group.avatar} name={group.name} size={44} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontWeight:600, fontSize:14, color:"#fff",
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {group.name}
            {isAdmin && <span style={{ fontSize:10, color:"#a78bfa", marginLeft:6 }}>• admin</span>}
          </div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginTop:2 }}>
            {group.members?.length || 0} members
          </div>
        </div>
      </div>
    );
  };

  // ── User row ──────────────────────────────────────────────────────
  const renderUserRow = (user) => (
    <div key={user._id} onClick={() => startDm(user)}
      style={{
        display:"flex", alignItems:"center", gap:12, padding:"10px 12px",
        borderRadius:12, cursor:"pointer", transition:"background 0.15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background="rgba(255,255,255,0.05)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background="transparent"; }}>
      <Avatar src={user.avatar} name={userName(user)} size={40} online={isOnline(user._id)} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:600, fontSize:14, color:"#fff",
          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {userName(user)}
        </div>
        <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)" }}>
          @{user.username}
          {isOnline(user._id) && <span style={{ color:"#22c55e", marginLeft:6 }}>● Online</span>}
        </div>
      </div>
      <span style={{ fontSize:12, color:"#7c3aed", fontWeight:600 }}>Message</span>
    </div>
  );

  // ── New Group modal ───────────────────────────────────────────────
  const NewGroupModal = () => (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.7)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000,
    }} onClick={() => setShowNewGroup(false)}>
      <div style={{
        background:"#1a1a2e", borderRadius:20, padding:28, width:"min(420px,92vw)",
        border:"1px solid rgba(255,255,255,0.1)",
      }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ color:"#fff", margin:"0 0 20px", fontSize:18 }}>Create New Group</h3>
        <input value={groupName} onChange={(e) => setGroupName(e.target.value)}
          placeholder="Group name…"
          style={{
            width:"100%", background:"rgba(255,255,255,0.07)",
            border:"1px solid rgba(255,255,255,0.12)", borderRadius:10,
            padding:"10px 14px", color:"#fff", fontSize:14, outline:"none",
            boxSizing:"border-box", marginBottom:14,
          }} />
        <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)", marginBottom:8 }}>
          Add members ({groupMembers.length} selected):
        </div>
        <div style={{ maxHeight:200, overflowY:"auto", marginBottom:16 }}>
          {allUsers.map((u) => {
            const sel = groupMembers.some((m) => m._id === u._id);
            return (
              <div key={u._id} onClick={() => {
                if (sel) setGroupMembers((p) => p.filter((m) => m._id !== u._id));
                else setGroupMembers((p) => [...p, u]);
              }} style={{
                display:"flex", alignItems:"center", gap:10, padding:"8px 10px",
                borderRadius:10, cursor:"pointer",
                background: sel ? "rgba(124,58,237,0.25)" : "transparent",
                transition:"background 0.15s",
              }}>
                <Avatar src={u.avatar} name={userName(u)} size={32} />
                <div style={{ flex:1, fontSize:14, color:"#fff" }}>
                  {userName(u)}
                  <span style={{ fontSize:12, color:"rgba(255,255,255,0.4)", marginLeft:6 }}>@{u.username}</span>
                </div>
                {sel && <span style={{ color:"#a78bfa" }}>✓</span>}
              </div>
            );
          })}
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={() => setShowNewGroup(false)}
            style={{ flex:1, padding:"10px", background:"rgba(255,255,255,0.07)",
              border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, color:"#fff",
              cursor:"pointer", fontSize:14 }}>Cancel</button>
          <button onClick={createGroup} disabled={!groupName.trim() || groupMembers.length===0}
            style={{
              flex:2, padding:"10px", borderRadius:10, border:"none", cursor:"pointer",
              background: groupName.trim() && groupMembers.length>0
                ? "linear-gradient(135deg,#7c3aed,#5b21b6)" : "rgba(255,255,255,0.1)",
              color:"#fff", fontWeight:700, fontSize:14,
            }}>Create Group</button>
        </div>
      </div>
    </div>
  );

  const displayList = () => {
    if (searchResults !== null) {
      return (
        <div>
          <div style={{ fontSize:12, color:"rgba(255,255,255,0.4)", padding:"8px 12px" }}>
            Users — click to message
          </div>
          {searchResults.length === 0
            ? <div style={{ padding:"16px 12px", color:"rgba(255,255,255,0.3)", fontSize:14 }}>No users found</div>
            : searchResults.map(renderUserRow)}
        </div>
      );
    }

    if (tab === "dms") {
      return (
        <div>
          {dms.length > 0 && (
            <>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", padding:"8px 12px 4px",
                textTransform:"uppercase", letterSpacing:1 }}>Recent</div>
              {dms.map(renderDmItem)}
            </>
          )}
          <div style={{ fontSize:11, color:"rgba(255,255,255,0.35)", padding:"12px 12px 4px",
            textTransform:"uppercase", letterSpacing:1 }}>All Users</div>
          {allUsers.length === 0
            ? <div style={{ padding:"16px 12px", color:"rgba(255,255,255,0.3)", fontSize:14 }}>
                No other users registered yet
              </div>
            : allUsers.map(renderUserRow)}
        </div>
      );
    }

    return (
      <div>
        <div onClick={() => setShowNewGroup(true)}
          style={{
            display:"flex", alignItems:"center", gap:10, padding:"10px 12px",
            borderRadius:12, cursor:"pointer", border:"1px dashed rgba(124,58,237,0.5)",
            color:"#a78bfa", fontSize:14, fontWeight:600, margin:"4px 0 8px",
            transition:"background 0.15s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background="rgba(124,58,237,0.1)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background="transparent"; }}>
          + Create New Group
        </div>
        {groups.length === 0
          ? <div style={{ padding:"16px 12px", color:"rgba(255,255,255,0.3)", fontSize:14 }}>
              No groups yet. Create one!
            </div>
          : groups.map(renderGroupItem)}
      </div>
    );
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", minWidth:0 }}>
      {/* Search */}
      <div style={{ padding:"12px 12px 8px" }}>
        <div style={{ position:"relative" }}>
          <input value={search} onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search @username or name…"
            style={{
              width:"100%", background:"rgba(255,255,255,0.07)",
              border:"1px solid rgba(255,255,255,0.1)", borderRadius:22,
              padding:"9px 14px 9px 36px", color:"#fff", fontSize:13,
              outline:"none", boxSizing:"border-box",
            }} />
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", pointerEvents:"none" }}>
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          {search && (
            <button onClick={() => { setSearch(""); setSearchResults(null); }}
              style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)",
                background:"none", border:"none", color:"rgba(255,255,255,0.4)",
                cursor:"pointer", fontSize:16, padding:0 }}>×</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      {searchResults === null && (
        <div style={{ display:"flex", gap:6, padding:"0 12px 8px" }}>
          {["dms","groups"].map((t) => (
            <button key={t} onClick={() => setTab(t)}
              style={{
                flex:1, padding:"7px 0", borderRadius:20, border:"none",
                background: tab===t ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.06)",
                color: tab===t ? "#fff" : "rgba(255,255,255,0.5)",
                fontWeight: tab===t ? 700 : 400, fontSize:13, cursor:"pointer",
                transition:"all 0.2s", display:"flex", alignItems:"center",
                justifyContent:"center", gap:6,
              }}>
              {t === "dms"
                ? <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> DMs</>
                : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Groups</>
              }
            </button>
          ))}
        </div>
      )}

      {/* List */}
      <div style={{ flex:1, overflowY:"auto", paddingBottom:8 }}>
        {loading
          ? <div style={{ padding:20, textAlign:"center", color:"rgba(255,255,255,0.3)" }}>Loading…</div>
          : displayList()}
      </div>

      {showNewGroup && <NewGroupModal />}
    </div>
  );
}