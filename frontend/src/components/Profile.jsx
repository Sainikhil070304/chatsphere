import { useState, useRef } from "react";
import API from "../services/api";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const avatarUrl = (path) => {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${BASE}${path}`;
};

export default function Profile({ user, setUser, onBack }) {
  const [form, setForm] = useState({
    firstName:  user.firstName  || "",
    middleName: user.middleName || "",
    lastName:   user.lastName   || "",
    username:   user.username   || "",
    bio:        user.bio        || "",
  });
  const [preview, setPreview] = useState(avatarUrl(user.avatar));
  const [msg,     setMsg]     = useState("");
  const [err,     setErr]     = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  const handlePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
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

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0d16",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px",
    }}>
      <div style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 24, padding: "36px 32px",
        width: "100%", maxWidth: 480,
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
          <button onClick={onBack} style={{
            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10, color: "#fff", cursor: "pointer", padding: "7px 14px",
            fontSize: 13, display: "flex", alignItems: "center", gap: 6,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </button>
          <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 700, margin: 0 }}>Your Profile</h2>
          {user.isAdmin && (
            <span style={{
              marginLeft: "auto", background: "rgba(124,58,237,0.2)",
              border: "1px solid rgba(124,58,237,0.4)", borderRadius: 20,
              padding: "3px 10px", fontSize: 11, color: "#a78bfa", fontWeight: 700,
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
              Admin
            </span>
          )}
        </div>

        {/* Avatar */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 28 }}>
          <div onClick={() => fileRef.current.click()} style={{
            position: "relative", cursor: "pointer",
            width: 100, height: 100, borderRadius: "50%",
            border: "3px solid rgba(124,58,237,0.5)",
            overflow: "hidden", flexShrink: 0,
          }}>
            {preview
              ? <img src={preview} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <div style={{
                  width: "100%", height: "100%",
                  background: "linear-gradient(135deg,#7c3aed,#4f46e5)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 36, fontWeight: 700, color: "#fff",
                }}>{initials(user)}</div>
            }
            {/* Hover overlay */}
            <div style={{
              position: "absolute", inset: 0,
              background: "rgba(0,0,0,0.5)",
              display: "flex", alignItems: "center", justifyContent: "center",
              opacity: 0, transition: "opacity 0.2s",
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = 1}
              onMouseLeave={e => e.currentTarget.style.opacity = 0}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </div>
          </div>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 10, marginBottom: 0 }}>
            Click to change photo
          </p>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
        </div>

        {/* Alerts */}
        {msg && (
          <div style={{
            background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: 10, padding: "10px 14px", color: "#4ade80",
            fontSize: 13, marginBottom: 16, textAlign: "center",
          }}>{msg}</div>
        )}
        {err && (
          <div style={{
            background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: 10, padding: "10px 14px", color: "#f87171",
            fontSize: 13, marginBottom: 16, textAlign: "center",
          }}>{err}</div>
        )}

        {/* Form */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Name row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <input
              placeholder="First Name" value={form.firstName}
              onChange={e => setForm({ ...form, firstName: e.target.value })}
              style={inputStyle}
            />
            <input
              placeholder="Middle Name" value={form.middleName}
              onChange={e => setForm({ ...form, middleName: e.target.value })}
              style={inputStyle}
            />
          </div>
          <input
            placeholder="Last Name" value={form.lastName}
            onChange={e => setForm({ ...form, lastName: e.target.value })}
            style={inputStyle}
          />

          {/* Username */}
          <div style={{ position: "relative" }}>
            <span style={{
              position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
              color: "#a78bfa", fontWeight: 700, fontSize: 15, pointerEvents: "none",
            }}>@</span>
            <input
              placeholder="username" value={form.username}
              onChange={e => setForm({ ...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, "") })}
              style={{ ...inputStyle, paddingLeft: 32 }}
            />
          </div>

          {/* Bio */}
          <div style={{ position: "relative" }}>
            <textarea
              placeholder="Bio (max 150 chars)" value={form.bio} maxLength={150} rows={3}
              onChange={e => setForm({ ...form, bio: e.target.value })}
              style={{ ...inputStyle, resize: "none", lineHeight: 1.5, paddingBottom: 24 }}
            />
            <span style={{
              position: "absolute", bottom: 10, right: 14,
              fontSize: 11, color: "rgba(255,255,255,0.3)",
            }}>{form.bio.length}/150</span>
          </div>

          {/* Info row */}
          <div style={{
            display: "flex", gap: 16, flexWrap: "wrap",
            padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.06)",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              {user.email}
            </span>
            {user.age > 0 && (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
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

          {/* Save button */}
          <button onClick={save} disabled={loading} style={{
            padding: "13px", borderRadius: 12, border: "none", cursor: loading ? "not-allowed" : "pointer",
            background: loading ? "rgba(255,255,255,0.1)" : "linear-gradient(135deg,#7c3aed,#5b21b6)",
            color: "#fff", fontWeight: 700, fontSize: 15,
            boxShadow: loading ? "none" : "0 4px 20px rgba(124,58,237,0.4)",
            transition: "all 0.2s", marginTop: 4,
          }}>
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12,
  padding: "11px 14px", color: "#fff", fontSize: 14, outline: "none",
  boxSizing: "border-box", transition: "border-color 0.2s",
};