import { useState, useEffect, useRef } from "react";
import API from "../services/api";

const imgSrc = s => s?.startsWith("http") ? s : `http://localhost:5000${s}`;
const timeAgo = t => {
  const s = Math.floor((Date.now() - new Date(t)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s/60)}m ago`;
  if (s < 86400) return `${Math.floor(s/3600)}h ago`;
  return `${Math.floor(s/86400)}d ago`;
};

const Av = ({ src, name, size = 36 }) => (
  <div style={{
    width: size, height: size, borderRadius: "50%", flexShrink: 0,
    overflow: "hidden", background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: size * 0.38, fontWeight: 700, color: "#fff",
  }}>
    {src
      ? <img src={imgSrc(src)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      : (name?.[0] || "?").toUpperCase()}
  </div>
);

function HeartBurst({ onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 800); return () => clearTimeout(t); }, []);
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex",
      alignItems: "center", justifyContent: "center",
      pointerEvents: "none", zIndex: 10,
    }}>
      <svg width="72" height="72" viewBox="0 0 24 24"
        fill="#ef4444" stroke="#ef4444" strokeWidth="1"
        style={{ animation: "heartBurst 0.8s ease-out forwards" }}>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    </div>
  );
}

// ── In-app Share Sheet (Instagram style) ───────────────────────
function ShareSheet({ post, currentUser, onClose }) {
  const [chats,    setChats]    = useState([]);
  const [sending,  setSending]  = useState(null);   // chatId being sent to
  const [sent,     setSent]     = useState({});      // { chatId: true }
  const [search,   setSearch]   = useState("");

  useEffect(() => {
    // Load DM chats
    API.get("/chat").then(r => {
      const list = (r.data || []).map(c => {
        const other = c.members?.find(m => String(m._id) !== String(currentUser._id));
        return { chatId: c._id, name: [other?.firstName,other?.lastName].filter(Boolean).join(" ") || other?.username || "User", avatar: other?.avatar, isGroup: false, _id: other?._id };
      });
      setChats(list);
    }).catch(() => {});
    // Load groups
    API.get("/groups").then(r => {
      const groups = (r.data || []).map(g => ({ chatId: g._id, name: g.name, avatar: g.avatar, isGroup: true, _id: g._id }));
      setChats(prev => [...prev, ...groups]);
    }).catch(() => {});
  }, []);

  const sendTo = async (chat) => {
    if (sent[chat.chatId]) return;
    setSending(chat.chatId);
    try {
      // Build a rich post-share message
      const caption = post.caption ? `"${post.caption.slice(0,80)}${post.caption.length>80?"…":""}"` : "";
      const authorName = [post.author?.firstName, post.author?.lastName].filter(Boolean).join(" ") || post.author?.username || "Someone";
      const mediaNote = post.media?.length > 0 ? (post.media[0]?.type === "video" ? " [Video]" : " [Photo]") : "";
      const text = `POST:${JSON.stringify({ postId: post._id, author: authorName, caption, mediaUrl: post.media?.[0]?.url || "", mediaNote })}`;

      await API.post(
        chat.isGroup ? "/groups/message" : "/chat",
        chat.isGroup
          ? { groupId: chat.chatId, encrypted: text, type: "post" }
          : { chat: chat.chatId, encrypted: text, type: "post" }
      );
      setSent(prev => ({ ...prev, [chat.chatId]: true }));
    } catch (e) { console.error(e); }
    finally { setSending(null); }
  };

  const filtered = chats.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ position:"fixed", inset:0, zIndex:9998, display:"flex", flexDirection:"column", justifyContent:"flex-end" }}
      onClick={onClose}>
      <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,.6)", backdropFilter:"blur(6px)" }} />
      <div style={{
        position:"relative", background:"rgba(15,18,32,.98)",
        borderRadius:"24px 24px 0 0", padding:"0 0 24px",
        maxHeight:"80vh", display:"flex", flexDirection:"column",
        border:"1px solid rgba(255,255,255,.08)",
        boxShadow:"0 -8px 40px rgba(0,0,0,.5)",
      }} onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div style={{ width:40, height:4, borderRadius:2, background:"rgba(255,255,255,.2)", margin:"12px auto 0" }}/>

        {/* Header */}
        <div style={{ padding:"14px 20px 10px", borderBottom:"1px solid rgba(255,255,255,.07)" }}>
          <div style={{ fontSize:15, fontWeight:700, color:"#fff", textAlign:"center", marginBottom:12 }}>
            Share to…
          </div>
          {/* Search */}
          <div style={{ position:"relative" }}>
            <svg style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", opacity:.4 }}
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search people & groups…"
              style={{ width:"100%", padding:"9px 12px 9px 34px", borderRadius:12,
                border:"1px solid rgba(255,255,255,.1)", background:"rgba(255,255,255,.07)",
                color:"#fff", fontSize:13, outline:"none", boxSizing:"border-box" }}
            />
          </div>
        </div>

        {/* Post preview */}
        <div style={{ margin:"12px 16px", padding:"10px 12px", borderRadius:12,
          background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.06)",
          display:"flex", gap:10, alignItems:"center" }}>
          {post.media?.[0] && (
            <div style={{ width:44, height:44, borderRadius:8, overflow:"hidden", flexShrink:0 }}>
              {post.media[0]?.type === "video"
                ? <video src={imgSrc(post.media[0].url)} style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                : <img src={imgSrc(post.media[0]?.url || post.media[0])} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
              }
            </div>
          )}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, color:"rgba(255,255,255,.5)", marginBottom:2 }}>
              {[post.author?.firstName,post.author?.lastName].filter(Boolean).join(" ") || post.author?.username}
            </div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,.8)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {post.caption || (post.media?.length > 0 ? "Photo" : "Post")}
            </div>
          </div>
        </div>

        {/* Chat list */}
        <div style={{ overflowY:"auto", flex:1, padding:"0 12px" }}>
          {filtered.length === 0 && (
            <div style={{ textAlign:"center", padding:"32px 0", color:"rgba(255,255,255,.3)", fontSize:13 }}>
              No chats found
            </div>
          )}
          {filtered.map(chat => {
            const isSent    = sent[chat.chatId];
            const isSending = sending === chat.chatId;
            return (
              <div key={chat.chatId} style={{
                display:"flex", alignItems:"center", gap:12,
                padding:"10px 8px", borderRadius:12, cursor:"pointer",
                transition:"background .15s",
              }}
                onMouseEnter={e => e.currentTarget.style.background="rgba(255,255,255,.05)"}
                onMouseLeave={e => e.currentTarget.style.background="transparent"}
                onClick={() => sendTo(chat)}
              >
                <div style={{ width:44, height:44, borderRadius:"50%", flexShrink:0,
                  background:"linear-gradient(135deg,#7c3aed,#4f46e5)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  fontSize:18, fontWeight:700, color:"#fff", overflow:"hidden" }}>
                  {chat.avatar
                    ? <img src={imgSrc(chat.avatar)} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                    : chat.isGroup ? "👥" : chat.name[0]?.toUpperCase()
                  }
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:"#fff" }}>{chat.name}</div>
                  <div style={{ fontSize:12, color:"rgba(255,255,255,.35)" }}>{chat.isGroup ? "Group" : "Direct message"}</div>
                </div>
                <div style={{ width:32, height:32, borderRadius:"50%", flexShrink:0,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  background: isSent ? "rgba(34,197,94,.2)" : "rgba(108,99,255,.15)",
                  border: `1.5px solid ${isSent ? "rgba(34,197,94,.5)" : "rgba(108,99,255,.3)"}`,
                  transition:"all .2s",
                }}>
                  {isSending
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation:"spin 1s linear infinite" }}><circle cx="12" cy="12" r="10"/></svg>
                    : isSent
                      ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  }
                </div>
              </div>
            );
          })}
        </div>

        {/* Close */}
        <div style={{ padding:"12px 20px 0" }}>
          <button onClick={onClose} style={{
            width:"100%", padding:"13px", borderRadius:14, border:"none",
            background:"rgba(255,255,255,.07)", color:"rgba(255,255,255,.6)",
            fontWeight:600, fontSize:14, cursor:"pointer",
          }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function PostCard({ post, currentUser, onDelete }) {
  const [likes,        setLikes]        = useState(post.likes?.length || 0);
  const [liked,        setLiked]        = useState(post.likes?.map(String).includes(String(currentUser._id)));
  const [comments,     setComments]     = useState(post.comments || []);
  const [showComments, setShowComments] = useState(false);
  const [commentText,  setCommentText]  = useState("");
  const [submitting,   setSubmitting]   = useState(false);
  const [heartBurst,   setHeartBurst]   = useState(false);
  const [imgIdx,       setImgIdx]       = useState(0);
  const [showShare,    setShowShare]    = useState(false);
  const [sharePulse,   setSharePulse]   = useState(false);
  const lastTap = useRef(0);

  const authorName = [post.author?.firstName, post.author?.lastName].filter(Boolean).join(" ") || post.author?.username || "User";
  const isMe = String(post.author?._id) === String(currentUser._id);
  const mediaItems = post.media || [];

  const handleDoubleTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!liked) { toggleLike(); setHeartBurst(true); }
    }
    lastTap.current = now;
  };

  const toggleLike = async () => {
    setLiked(l => !l);
    setLikes(n => liked ? n - 1 : n + 1);
    const res = await API.post(`/posts/${post._id}/like`).catch(() => null);
    if (res) { setLikes(res.data.likes); setLiked(res.data.liked); }
  };

  const addComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    try {
      const res = await API.post(`/posts/${post._id}/comment`, { text: commentText.trim() });
      setComments(prev => [...prev, res.data]);
      setCommentText("");
    } catch {}
    finally { setSubmitting(false); }
  };

  const deleteComment = async (commentId) => {
    await API.delete(`/posts/${post._id}/comment/${commentId}`).catch(() => {});
    setComments(prev => prev.filter(c => String(c._id) !== commentId));
  };

  const sharePost = () => {
    setSharePulse(true);
    setTimeout(() => setSharePulse(false), 400);
    setShowShare(true);
  };

  return (
    <div className="pc">
      {/* Header */}
      <div className="pc-header">
        <Av src={post.author?.avatar} name={authorName} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pc-author">{authorName}</div>
          <div className="pc-meta">@{post.author?.username} · {timeAgo(post.createdAt)}</div>
        </div>
        {isMe && (
          <button className="pc-delete" onClick={() => onDelete(post._id)} title="Delete">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/>
              <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
            </svg>
          </button>
        )}
      </div>

      {/* Caption */}
      {post.caption && <div className="pc-caption">{post.caption}</div>}

      {/* Media carousel */}
      {mediaItems.length > 0 && (
        <div className="pc-media-wrap" onDoubleClick={handleDoubleTap} onClick={handleDoubleTap}>
          {heartBurst && <HeartBurst onDone={() => setHeartBurst(false)} />}
          {mediaItems[imgIdx]?.type === "video"
            ? <video src={imgSrc(mediaItems[imgIdx].url)} controls className="pc-media" />
            : <img src={imgSrc(mediaItems[imgIdx]?.url || mediaItems[imgIdx])} alt="" className="pc-media"
                onClick={() => window.open(imgSrc(mediaItems[imgIdx]?.url || mediaItems[imgIdx]), "_blank")} />
          }
          {mediaItems.length > 1 && (
            <>
              <div className="pc-dots">
                {mediaItems.map((_, i) => (
                  <span key={i} className={`pc-dot ${i === imgIdx ? "active" : ""}`}
                    onClick={e => { e.stopPropagation(); setImgIdx(i); }} />
                ))}
              </div>
              {imgIdx > 0 && (
                <button className="pc-arrow left" onClick={e => { e.stopPropagation(); setImgIdx(i => i - 1); }}>‹</button>
              )}
              {imgIdx < mediaItems.length - 1 && (
                <button className="pc-arrow right" onClick={e => { e.stopPropagation(); setImgIdx(i => i + 1); }}>›</button>
              )}
            </>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="pc-actions">
        <button className={`pc-btn like-btn ${liked ? "liked" : ""}`} onClick={toggleLike}>
          <svg width="22" height="22" viewBox="0 0 24 24"
            fill={liked ? "#ef4444" : "none"}
            stroke={liked ? "#ef4444" : "currentColor"}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transition: "all .2s" }}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          {likes > 0 && <span className="pc-count">{likes}</span>}
        </button>

        <button className="pc-btn" onClick={() => setShowComments(s => !s)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke={showComments ? "#a78bfa" : "currentColor"}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {comments.length > 0 && <span className="pc-count">{comments.length}</span>}
        </button>

        {/* Share button — with pulse animation on click */}
        <button className="pc-btn" onClick={sharePost}
          style={{ transition: "all .2s", transform: sharePulse ? "scale(1.3)" : "scale(1)" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
            stroke={sharePulse ? "#22c55e" : "currentColor"}
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{ transition: "stroke .3s" }}>
            <circle cx="18" cy="5" r="3"/>
            <circle cx="6" cy="12" r="3"/>
            <circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>
      </div>

      {likes > 0 && <div className="pc-likes-label">{likes} {likes === 1 ? "like" : "likes"}</div>}
      {showShare && <ShareSheet post={post} currentUser={currentUser} onClose={() => setShowShare(false)} />}

      {/* Comments */}
      {showComments && (
        <div className="pc-comments">
          {comments.map(c => {
            const cName = [c.user?.firstName, c.user?.lastName].filter(Boolean).join(" ") || c.user?.username || "User";
            const canDelete = String(c.user?._id) === String(currentUser._id) || isMe;
            return (
              <div key={c._id} className="pc-comment">
                <Av src={c.user?.avatar} name={cName} size={28} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="pc-comment-name">{cName} </span>
                  <span className="pc-comment-text">{c.text}</span>
                  <div className="pc-comment-time">{timeAgo(c.createdAt)}</div>
                </div>
                {canDelete && (
                  <button onClick={() => deleteComment(String(c._id))} className="pc-comment-del">✕</button>
                )}
              </div>
            );
          })}
          <div className="pc-comment-input">
            <Av src={currentUser.avatar} name={[currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") || currentUser.username} size={28} />
            <input
              placeholder="Add a comment…"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addComment()}
            />
            {commentText.trim() && (
              <button onClick={addComment} disabled={submitting}>{submitting ? "…" : "Post"}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Create Post ─────────────────────────────────────────────────
function CreatePost({ currentUser, onPost }) {
  const [caption,  setCaption]  = useState("");
  const [files,    setFiles]    = useState([]);
  const [previews, setPreviews] = useState([]);
  const [posting,  setPosting]  = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fileRef = useRef();
  const authorName = [currentUser.firstName, currentUser.lastName].filter(Boolean).join(" ") || currentUser.username || "You";

  const handleFiles = (e) => {
    const f = Array.from(e.target.files);
    setFiles(f);
    setPreviews(f.map(file => ({ url: URL.createObjectURL(file), type: file.type.startsWith("video/") ? "video" : "image" })));
    setExpanded(true);
  };

  const removePreview = (i) => {
    setFiles(prev => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  const submit = async () => {
    if (!caption.trim() && files.length === 0) return;
    setPosting(true);
    try {
      const fd = new FormData();
      fd.append("caption", caption);
      files.forEach(f => fd.append("media", f));
      const res = await API.post("/posts", fd); // axios sets boundary automatically
      onPost(res.data);
      setCaption(""); setFiles([]); setPreviews([]); setExpanded(false);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) { alert(e.response?.data?.msg || "Failed to post"); }
    finally { setPosting(false); }
  };

  return (
    <div className="cp-card">
      <div className="cp-top">
        <Av src={currentUser.avatar} name={authorName} size={40} />
        <input
          className="cp-input"
          placeholder="What's on your mind?"
          value={caption}
          onChange={e => { setCaption(e.target.value); setExpanded(true); }}
          onFocus={() => setExpanded(true)}
        />
      </div>

      {previews.length > 0 && (
        <div className={`cp-previews ${previews.length > 1 ? "grid" : ""}`}>
          {previews.map((p, i) => (
            <div key={i} className="cp-preview-item">
              {p.type === "video"
                ? <video src={p.url} className="cp-preview-media" />
                : <img src={p.url} alt="" className="cp-preview-media" />
              }
              <button className="cp-preview-rm" onClick={() => removePreview(i)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {expanded && (
        <div className="cp-bar">
          <input ref={fileRef} type="file" multiple accept="image/*,video/*" style={{ display: "none" }} onChange={handleFiles} />
          <button className="cp-media-btn" onClick={() => fileRef.current.click()} title="Photo / Video">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span>Photo/Video</span>
          </button>
          <div style={{ flex: 1 }} />
          {files.length > 0 && (
            <span className="cp-file-badge">{files.length} file{files.length > 1 ? "s" : ""}</span>
          )}
          <button className="cp-post-btn" onClick={submit}
            disabled={posting || (!caption.trim() && files.length === 0)}>
            {posting
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}><circle cx="12" cy="12" r="10"/></svg>
              : "Share"
            }
          </button>
        </div>
      )}

      {!expanded && (
        <div className="cp-quick">
          <button className="cp-quick-btn" onClick={() => { fileRef.current.click(); setExpanded(true); }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span style={{ color: "#22c55e" }}>Photo/Video</span>
          </button>
          <input ref={fileRef} type="file" multiple accept="image/*,video/*" style={{ display: "none" }} onChange={handleFiles} />
        </div>
      )}
    </div>
  );
}

// ── Feed ────────────────────────────────────────────────────────
export default function Feed({ currentUser }) {
  const [posts,   setPosts]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get("/posts/feed")
      .then(r => setPosts(r.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleNewPost = (post) => setPosts(prev => [post, ...prev]);

  const deletePost = async (postId) => {
    if (!confirm("Delete this post?")) return;
    await API.delete(`/posts/${postId}`).catch(() => {});
    setPosts(prev => prev.filter(p => p._id !== postId));
  };

  return (
    <div className="feed-page">
      <div className="feed-inner">
        <CreatePost currentUser={currentUser} onPost={handleNewPost} />

        {loading && (
          <div className="feed-loading">
            {[1,2,3].map(i => <div key={i} className="feed-skeleton" />)}
          </div>
        )}

        {!loading && posts.length === 0 && (
          <div className="feed-empty">
            <div className="feed-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
              </svg>
            </div>
            <div className="feed-empty-title">Your feed is empty</div>
            <div className="feed-empty-sub">Follow people from their profiles to see their posts here</div>
          </div>
        )}

        {posts.map(p => (
          <PostCard key={p._id} post={p} currentUser={currentUser}
            onDelete={deletePost} />
        ))}
      </div>

      <style>{`
        @keyframes heartBurst {
          0%   { transform: scale(0);   opacity: 1; }
          50%  { transform: scale(1.3); opacity: 1; }
          100% { transform: scale(1);   opacity: 0; }
        }
        @keyframes slideUp {
          from { transform: translate(-50%, 16px); opacity: 0; }
          to   { transform: translate(-50%, 0);    opacity: 1; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}