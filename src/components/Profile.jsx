import { useState, useRef } from "react";
import API from "../services/api";

export default function Profile({ user, setUser, onBack }) {
  const [form, setForm] = useState({
    firstName: user.firstName || "",
    middleName: user.middleName || "",
    lastName: user.lastName || "",
    username: user.username || "",
    bio: user.bio || "",
  });
  const [preview, setPreview] = useState(user.avatar ? `http://localhost:5000${user.avatar}` : null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef();

  const handlePhoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    const fd = new FormData();
    fd.append("avatar", file);
    try {
      const res = await API.post("/profile/avatar", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const updated = { ...user, avatar: res.data.avatar };
      localStorage.setItem("me", JSON.stringify(updated));
      setUser(updated);
      setMsg("Profile photo updated!");
    } catch (e) { setErr("Failed to upload photo"); }
  };

  const save = async () => {
    setLoading(true); setMsg(""); setErr("");
    try {
      const res = await API.put("/profile/me", form);
      const updated = { ...user, ...res.data };
      localStorage.setItem("me", JSON.stringify(updated));
      setUser(updated);
      setMsg("Profile saved!");
    } catch (e) { setErr(e.response?.data?.msg || "Failed to save"); }
    finally { setLoading(false); }
  };

  return (
    <div className="profile-page">
      <div className="profile-card">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h2>Your Profile</h2>

        {/* Avatar */}
        <div className="avatar-upload" onClick={() => fileRef.current.click()}>
          <div className="avatar-large">
            {preview
              ? <img src={preview} alt="avatar" />
              : <span>{user.firstName?.[0]?.toUpperCase()}</span>
            }
            <div className="avatar-overlay">
              {/* Camera SVG — matches sidebar icon style */}
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
            </div>
          </div>
          <p>Click to change photo</p>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} style={{ display: "none" }} />
        </div>

        {msg && <div className="auth-success">{msg}</div>}
        {err && <div className="auth-error">{err}</div>}

        <div className="profile-form">
          <div className="name-row">
            <input placeholder="First Name"  value={form.firstName}  onChange={e => setForm({...form, firstName:  e.target.value})} />
            <input placeholder="Middle Name" value={form.middleName} onChange={e => setForm({...form, middleName: e.target.value})} />
          </div>
          <input placeholder="Last Name" value={form.lastName} onChange={e => setForm({...form, lastName: e.target.value})} />

          <div className="username-input-wrap">
            <span className="at-sign">@</span>
            <input
              placeholder="username"
              value={form.username}
              onChange={e => setForm({...form, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, "")})}
            />
          </div>

          <textarea
            placeholder="Bio (max 150 chars)"
            value={form.bio}
            maxLength={150}
            onChange={e => setForm({...form, bio: e.target.value})}
            rows={3}
          />
          <div className="bio-count">{form.bio.length}/150</div>

          {/* Info row — SVG icons matching sidebar style */}
          <div className="profile-info-row">
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              {user.email}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8"  y1="2" x2="8"  y2="6"/>
                <line x1="3"  y1="10" x2="21" y2="10"/>
              </svg>
              Age {user.age}
            </span>
            {user.isAdmin && (
              <span className="admin-badge" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                </svg>
                Admin
              </span>
            )}
          </div>

          <button onClick={save} disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}