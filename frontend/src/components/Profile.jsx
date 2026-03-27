import { useState, useRef } from "react";
import API from "../services/api";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const avatarUrl = (path) => {
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  return `${BASE}${path}`;
};

const inputStyle = {
  width: "100%",
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 14,
  padding: "12px 16px",
  color: "#fff",
  fontSize: 14,
  outline: "none",
  boxSizing: "border-box",
  fontFamily: "'Outfit', sans-serif",
  transition: "border-color 0.2s, box-shadow 0.2s",
};

export default function Profile({ user, setUser, onBack }) {
  const [form, setForm] = useState({
    firstName:  user.firstName  || "",
    middleName: user.middleName || "",
    lastName:   user.lastName   || "",
    username:   user.username   || "",
    bio:        user.bio        || "",
  });
  const [preview, setPreview]   = useState(avatarUrl(user.avatar));
  const [imgError, setImgError] = useState(false);
  const [msg,      setMsg]      = useState("");
  const [err,      setErr]      = useState("");
  const [loading,  setLoading]  = useState(false);
  const [hover,    setHover]    = useState(false);
  const fileRef = useRef();

  const handlePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setImgError(false);
    const fd = new FormData();
    fd.append("avatar", file);
    try {
      const res     = await API.post("/profile/avatar", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const updated = { ...user, avatar: res.data.avatar };
      localStorage.setItem("me", JSON.stringify(updated));
      setUser(updated);
      setPreview(avatarUrl(res.data.avatar));
      setMsg("Profile photo updated!");
      setTimeout(() => setMsg(""), 3000);
    } catch { setErr("Failed to upload photo"); }
  };

  const save = async () => {
    setLoading(true); setMsg(""); setErr("");
    try {
      const res     = await API.put("/profile/me", form);
      const updated = { ...user, ...res.data };
      localStorage.setItem("me", JSON.stringify(updated));
      setUser(updated);
      setMsg("Profile saved!");
      setTimeout(() => setMsg(""), 3000);
    } catch (e) { setErr(e.response?.data?.msg || "Failed to save"); }
    finally { setLoading(false); }
  };

  const initials = (u) =>
    [u.firstName, u.lastName].filter(Boolean).map(n => n[0]).join("").toUpperCase() || "?";

  const showImg = preview && !imgError;

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      background: "#06080f",
      overflowY: "auto",
      WebkitOverflowScrolling: "touch",
    }}>
      {/* ── Sticky header ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        display: "flex", alignItems: "center", gap: 10,
        padding: "14px 18px",
        background: "rgba(6,8,15,0.92)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12, color: "#fff", cursor: "pointer",
          padding: "7px 14px", fontSize: 13, fontFamily: "'Outfit', sans-serif",
          display: "flex", alignItems: "center", gap: 6,
          flexShrink: 0, whiteSpace: "nowrap", transition: "background .2s",
        }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
          Back
        </button>

        <h2 style={{
          color: "#fff", fontSize: 17, fontWeight: 700,
          margin: 0, whiteSpace: "nowrap", overflow: "hidden",
          textOverflow: "ellipsis", flex: 1, letterSpacing: "-0.02em",
        }}>
          Your Profile
        </h2>

        {user.isAdmin && (
          <span style={{
            flexShrink: 0,
            background: "rgba(108,92,231,0.18)",
            border: "1px solid rgba(108,92,231,0.35)",
            borderRadius: 20, padding: "4px 12px",
            fontSize: 11, color: "#a29bfe", fontWeight: 700,
            display: "flex", alignItems: "center", gap: 5,
            whiteSpace: "nowrap",
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            Admin
          </span>
        )}
      </div>

      {/* ── Scrollable body ── */}
      <div style={{
        flex: 1, display: "flex",
        alignItems: "flex-start", justifyContent: "center",
        padding: "28px 16px 48px",
      }}>
        <div style={{
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 24, padding: "32px 28px",
          width: "100%", maxWidth: 480,
          boxShadow: "0 24px 80px rgba(0,0,0,0.5), 0 0 40px rgba(108,92,231,0.08)",
        }}>

          {/* ── Avatar ── */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
            {/* Clickable avatar wrapper — overlay is pointer-events:none so clicks pass through */}
            <div
              onClick={() => fileRef.current.click()}
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              style={{
                position: "relative", cursor: "pointer",
                width: 100, height: 100, borderRadius: "50%",
                border: "3px solid rgba(108,92,231,0.45)",
                overflow: "hidden", flexShrink: 0,
                transform: hover ? "scale(1.04)" : "scale(1)",
                transition: "transform .2s, box-shadow .2s",
                boxShadow: hover ? "0 0 24px rgba(108,92,231,0.45)" : "0 0 0 rgba(108,92,231,0)",
              }}
            >
              {/* Avatar image or initials */}
              {showImg
                ? <img
                    src={preview}
                    alt="avatar"
                    onError={() => setImgError(true)}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                : <div style={{
                    width: "100%", height: "100%",
                    background: "linear-gradient(135deg,#6c5ce7,#a29bfe)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 36, fontWeight: 700, color: "#fff",
                  }}>{initials(user)}</div>
              }

              {/* Hover overlay — pointer-events:none so it doesn't block the click */}
              <div style={{
                position: "absolute", inset: 0,
                background: "rgba(0,0,0,0.55)",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: hover ? 1 : 0,
                transition: "opacity 0.2s",
                pointerEvents: "none",
              }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                  <circle cx="12" cy="13" r="4"/>
                </svg>
              </div>
            </div>

            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 12, letterSpacing: "0.02em" }}>
              Click to change photo
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handlePhoto}
              style={{ display: "none" }}
            />
          </div>

          {/* ── Alerts ── */}
          {msg && (
            <div style={{
              background: "rgba(0,184,148,0.1)", border: "1px solid rgba(0,184,148,0.25)",
              borderRadius: 12, padding: "10px 16px", color: "#55efc4",
              fontSize: 13, marginBottom: 18, textAlign: "center",
            }}>{msg}</div>
          )}
          {err && (
            <div style={{
              background: "rgba(225,112,85,0.1)", border: "1px solid rgba(225,112,85,0.25)",
              borderRadius: 12, padding: "10px 16px", color: "#fab1a0",
              fontSize: 13, marginBottom: 18, textAlign: "center",
            }}>{err}</div>
          )}

          {/* ── Form ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <input
                placeholder="First Name" value={form.firstName}
                onChange={e => setForm({ ...form, firstName: e.target.value })}
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = "rgba(108,92,231,0.5)"; e.target.style.boxShadow = "0 0 0 3px rgba(108,92,231,0.1)"; }}
                onBlur={e  => { e.target.style.borderColor = "rgba(255,255,255,0.08)"; e.target.style.boxShadow = "none"; }}
              />
              <input
                placeholder="Middle Name" value={form.middleName}
                onChange={e => setForm({ ...form, middleName: e.target.value })}
                style={inputStyle}
                onFocus={e => { e.target.style.borderColor = "rgba(108,92,231,0.5)"; e.target.style.boxShadow = "0 0 0 3px rgba(108,92,231,0.1)"; }}
                onBlur={e  => { e.target.style.borderColor = "rgba(255,255,255,0.08)"; e.target.style.boxShadow = "none"; }}
              />
            </div>

            <input
              placeholder="Last Name" value={form.lastName}
              onChange={e => setForm({ ...form, lastName: e.target.value })}
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = "rgba(108,92,231,0.5)"; e.target.style.boxShadow = "0 0 0 3px rgba(108,92,231,0.1)"; }}
              onBlur={e  => { e.target.style.borderColor = "rgba(255,255,255,0.08)"; e.target.style.boxShadow = "none"; }}
            />

            {/* Username */}
            <div style={{
              display: "flex", alignItems: "center",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 14, overflow: "hidden",
            }}>
              <span style={{ padding: "12px 4px 12px 16px", color: "#a29bfe", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>@</span>
              <input
                placeholder="username" value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, "") })}
                style={{ ...inputStyle, border: "none", background: "transparent", paddingLeft: 4, borderRadius: 0, boxSizing: "border-box" }}
              />
            </div>

            {/* Bio */}
            <div style={{ position: "relative" }}>
              <textarea
                placeholder="Bio (max 150 chars)" value={form.bio} maxLength={150} rows={3}
                onChange={e => setForm({ ...form, bio: e.target.value })}
                style={{ ...inputStyle, resize: "none", lineHeight: 1.55, paddingBottom: 28 }}
                onFocus={e => { e.target.style.borderColor = "rgba(108,92,231,0.5)"; e.target.style.boxShadow = "0 0 0 3px rgba(108,92,231,0.1)"; }}
                onBlur={e  => { e.target.style.borderColor = "rgba(255,255,255,0.08)"; e.target.style.boxShadow = "none"; }}
              />
              <span style={{
                position: "absolute", bottom: 10, right: 14,
                fontSize: 11, color: "rgba(255,255,255,0.25)",
                fontFamily: "'Space Mono', monospace",
              }}>{form.bio.length}/150</span>
            </div>

            {/* Email + age info */}
            <div style={{
              display: "flex", gap: 16, flexWrap: "wrap",
              padding: "10px 4px",
              borderTop: "1px solid rgba(255,255,255,0.05)",
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
                {user.email}
              </span>
              {user.age > 0 && (
                <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/>
                    <line x1="8" y1="2" x2="8" y2="6"/>
                    <line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  Age {user.age}
                </span>
              )}
            </div>

            {/* Save */}
            <button
              onClick={save}
              disabled={loading}
              style={{
                padding: "14px", borderRadius: 14, border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                background: loading ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#6c5ce7,#a29bfe)",
                color: "#fff", fontWeight: 700, fontSize: 15,
                fontFamily: "'Outfit', sans-serif", letterSpacing: "0.01em",
                boxShadow: loading ? "none" : "0 4px 20px rgba(108,92,231,0.45)",
                transition: "all 0.2s", marginTop: 4,
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow = "0 6px 28px rgba(108,92,231,0.6)"; }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.boxShadow = "0 4px 20px rgba(108,92,231,0.45)"; }}
            >
              {loading ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}