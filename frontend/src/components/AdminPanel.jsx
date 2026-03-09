import { useEffect, useState } from "react";
import API from "../services/api";

export default function AdminPanel({ onBack }) {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    Promise.all([
      API.get("/admin/users"),
      API.get("/admin/stats"),
    ]).then(([u, s]) => {
      setUsers(u.data);
      setStats(s.data);
    }).finally(() => setLoading(false));
  }, []);

  const deleteUser = async (id) => {
    if (!confirm("Delete this user permanently?")) return;
    await API.delete(`/admin/users/${id}`);
    setUsers(prev => prev.filter(u => u._id !== id));
  };

  const toggleBan = async (id) => {
    const res = await API.patch(`/admin/users/${id}/ban`);
    setUsers(prev => prev.map(u => u._id === id ? { ...u, isBanned: res.data.isBanned } : u));
  };

  const filtered = users.filter(u =>
    u.username?.includes(search.toLowerCase()) ||
    u.email?.includes(search.toLowerCase()) ||
    u.firstName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h2>🛡️ Admin Panel</h2>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-num">{stats.users}</div><div>Total Users</div></div>
          <div className="stat-card"><div className="stat-num">{stats.messages}</div><div>Messages</div></div>
          <div className="stat-card"><div className="stat-num">{stats.chats}</div><div>Chats</div></div>
          <div className="stat-card"><div className="stat-num red">{stats.banned}</div><div>Banned</div></div>
          <div className="stat-card"><div className="stat-num green">{stats.newToday}</div><div>New Today</div></div>
        </div>
      )}

      <div className="admin-search">
        <input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <div className="loading">Loading...</div> : (
        <div className="users-table">
          <div className="table-header">
            <span>User</span><span>Username</span><span>Age</span><span>Status</span><span>Actions</span>
          </div>
          {filtered.map(u => (
            <div key={u._id} className={`table-row ${u.isBanned ? "banned" : ""}`}>
              <span className="user-cell">
                <div className="mini-avatar">{u.firstName?.[0] || "?"}</div>
                <div>
                  <div>{u.firstName} {u.lastName}</div>
                  <div className="small-email">{u.email}</div>
                </div>
              </span>
              <span>@{u.username || "—"}</span>
              <span>{u.age || "—"}</span>
              <span>
                {u.isAdmin && <span className="badge admin">Admin</span>}
                {u.isBanned && <span className="badge ban">Banned</span>}
                {!u.isAdmin && !u.isBanned && <span className="badge ok">Active</span>}
              </span>
              <span className="actions">
                <button className="btn-ban" onClick={() => toggleBan(u._id)}>
                  {u.isBanned ? "Unban" : "Ban"}
                </button>
                <button className="btn-delete" onClick={() => deleteUser(u._id)}>Delete</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
