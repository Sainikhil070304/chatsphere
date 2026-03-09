

require("dotenv").config();
const express   = require("express");
const http      = require("http");
const socketIO  = require("socket.io");
const cors      = require("cors");
const path      = require("path");
const mongoose  = require("mongoose");
const connectDB = require("./config/db");

// ── Pre-load models ───────────────────────────────────────────────
require("./models/User");
require("./models/Chat");
require("./models/Message");
require("./models/Group");
require("./models/Post");
require("./models/ConnectionRequest");

// ── Routes ────────────────────────────────────────────────────────
const authRoutes       = require("./routes/auth");
const chatRoutes       = require("./routes/chat");
const userRoutes       = require("./routes/user");
const profileRoutes    = require("./routes/profile");
const adminRoutes      = require("./routes/admin");
const groupRoutes      = require("./routes/group");
const postRoutes       = require("./routes/posts");
const connectionRoutes = require("./routes/connections");

const { userTrie }                      = require("./dsa/TrieSearch");
const { messageQueue }                  = require("./dsa/MessageQueue");
const { messageCache }                  = require("./dsa/LRUCache");
const { messageLimiter, searchLimiter } = require("./dsa/RateLimiter");
const authMiddleware                    = require("./middleware/authMiddleware");

const app = express();
app.use(express.json({ limit: "25mb" }));
app.use(cors());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth",        authRoutes);
app.use("/api/chat",        chatRoutes);
app.use("/api/user",        userRoutes);
app.use("/api/profile",     profileRoutes);
app.use("/api/admin",       adminRoutes);
app.use("/api/groups",      groupRoutes);
app.use("/api/posts",       postRoutes);
app.use("/api/connections", connectionRoutes);

app.get("/api/search", authMiddleware, (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  const check = searchLimiter.isAllowed(req.user.id);
  if (!check.allowed) return res.status(429).json({ msg: `Retry in ${check.retryAfter}s` });
  const results = userTrie.search(q, 10).filter(u => u._id.toString() !== req.user.id);
  res.json(results);
});

const server = http.createServer(app);
const io     = socketIO(server, { cors: { origin: "*" }, pingInterval: 10000, pingTimeout: 5000 });

// ══════════════════════════════════════════════════════════════════
// DSA: userId → Set<socketId>  supports multiple tabs on same device
// DSA: socketId → userId  reverse lookup O(1)
// ══════════════════════════════════════════════════════════════════
const onlineMap    = new Map();  // userId  → Set<socketId>
const socketToUser = new Map();  // socketId → userId
const typingTimers = new Map();  // debounce key → timeout

// Get the most-recently-connected socket for a user (last in Set)
const getSocket = (userId) => {
  const sockets = onlineMap.get(String(userId));
  if (!sockets || sockets.size === 0) return null;
  let last;
  sockets.forEach(s => { last = s; });
  return last;
};

// Emit to ALL sockets of a user (every tab gets the event)
const emitToUser = (userId, event, data) => {
  const sockets = onlineMap.get(String(userId));
  if (!sockets) return false;
  sockets.forEach(sid => io.to(sid).emit(event, data));
  return sockets.size > 0;
};

io.on("connection", (socket) => {

  // ── Online ──────────────────────────────────────────────────────
  socket.on("online", async (userId) => {
    const uid = String(userId);
    if (!onlineMap.has(uid)) onlineMap.set(uid, new Set());
    onlineMap.get(uid).add(socket.id);
    socketToUser.set(socket.id, uid);
    io.emit("userOnline", userId);

    // Join all group rooms
    try {
      const Group  = mongoose.model("Group");
      const groups = await Group.find({ members: userId }, "_id").lean();
      groups.forEach(g => socket.join("group:" + g._id));
    } catch {}

    // Flush offline queue
    if (messageQueue.hasMessages(userId))
      messageQueue.flush(userId).forEach(m => socket.emit("receive", m));
  });

  // ── Send message ────────────────────────────────────────────────
  socket.on("send", (data) => {
    const check = messageLimiter.isAllowed(data.from);
    if (!check.allowed) { socket.emit("rateLimited", { msg: `Retry in ${check.retryAfter}s` }); return; }

    const payload = {
      encrypted:  data.encrypted,
      from:       data.from,
      type:       data.type,
      msgId:      data.msgId,
      groupId:    data.groupId,
      senderName: data.senderName,
    };

    if (data.isGroup && data.groupId) {
      socket.to("group:" + data.groupId).emit("receive", payload);
    } else {
      const toSocket = getSocket(data.to);
      if (toSocket) {
        io.to(toSocket).emit("receive", payload);
        io.to(socket.id).emit("msgDelivered", { msgId: data.msgId });
      } else {
        messageQueue.enqueue(data.to, payload);
      }
    }
    if (data.chatId) messageCache.invalidate(data.chatId);
  });

  // ── Unsend ──────────────────────────────────────────────────────
  socket.on("unsend", (data) => {
    const { msgId, to, isGroup, groupId } = data;
    if (isGroup && groupId) {
      socket.to("group:" + groupId).emit("messageUnsent", { msgId });
    } else {
      emitToUser(to, "messageUnsent", { msgId });
    }
  });

  // ── Seen ────────────────────────────────────────────────────────
  socket.on("seen", ({ msgId, to }) => {
    emitToUser(to, "msgSeen", { msgId });
  });

  // ── Typing (debounced) ──────────────────────────────────────────
  socket.on("typing", (data) => {
    const fromUserId = socketToUser.get(socket.id);
    if (!fromUserId) return;

    if (typeof data === "object" && data.groupId) {
      const key = `${data.groupId}:${fromUserId}`;
      if (typingTimers.has(key)) return;
      socket.to("group:" + data.groupId).emit("typing", {
        from: fromUserId, name: data.name || "Someone", groupId: data.groupId,
      });
      typingTimers.set(key, setTimeout(() => typingTimers.delete(key), 800));
    } else {
      const recipientId = typeof data === "object" ? data.to : data;
      const key = `${fromUserId}:${recipientId}`;
      if (typingTimers.has(key)) return;
      emitToUser(recipientId, "typing", { from: fromUserId, name: data.name });
      typingTimers.set(key, setTimeout(() => typingTimers.delete(key), 800));
    }
  });

  socket.on("stopTyping", (data) => {
    const fromUserId = socketToUser.get(socket.id);
    if (!fromUserId) return;
    if (typeof data === "object" && data.groupId) {
      socket.to("group:" + data.groupId).emit("stopTyping", { from: fromUserId });
    } else {
      emitToUser(typeof data === "object" ? data.to : data, "stopTyping", { from: fromUserId });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // WebRTC Signalling
  // CALL FLOW:
  //   1. Caller  → "call:offer"    → server notifies callee with "call:incoming"
  //   2. Callee  → "call:answer"   → relayed to caller
  //   3. Both    → "call:ice"      → relayed to other side
  //   4. Either  → "call:end"      → other side gets "call:ended"
  //   5. Callee  → "call:rejected" → caller gets "call:rejected"
  //
  // NOTE: We use getSocket() (most-recent tab) for calls so that on the
  // SAME device, the call goes to the other user's most-recent socket,
  // not back to the sender's second tab.
  // ══════════════════════════════════════════════════════════════════

  socket.on("call:offer", async (data) => {
    const fromUserId = socketToUser.get(socket.id);
    const toSocket   = getSocket(data.to);
    if (!toSocket) return;

    // Look up caller name from DB for reliability
    let callerName = data.callerName || "Someone";
    try {
      const User   = mongoose.model("User");
      const caller = await User.findById(fromUserId, "firstName lastName username").lean();
      if (caller) callerName = [caller.firstName, caller.lastName].filter(Boolean).join(" ") || caller.username || callerName;
    } catch {}

    // Notify callee (shows incoming call banner)
    io.to(toSocket).emit("call:incoming", {
      from:       fromUserId,
      fromName:   callerName,
      callerName,
      callType:   data.isVideo ? "video" : "voice",
      isVideo:    !!data.isVideo,
      offer:      data.offer,
    });

    // Also relay the offer itself so callee can answer
    io.to(toSocket).emit("call:offer", { ...data, from: fromUserId, callerName });
  });

  socket.on("call:answer", (data) => {
    const fromUserId = socketToUser.get(socket.id);
    const toSocket   = getSocket(data.to);
    if (toSocket) io.to(toSocket).emit("call:answer", { ...data, from: fromUserId });
  });

  socket.on("call:ice", (data) => {
    const fromUserId = socketToUser.get(socket.id);
    const toSocket   = getSocket(data.to);
    if (toSocket) io.to(toSocket).emit("call:ice", { ...data, from: fromUserId });
  });

  socket.on("call:end", (data) => {
    const fromUserId = socketToUser.get(socket.id);
    // Emit "call:ended" (past tense) so receiver knows it's over
    emitToUser(data.to, "call:ended", { from: fromUserId });
  });

  socket.on("call:rejected", (data) => {
    const fromUserId = socketToUser.get(socket.id);
    const toSocket   = getSocket(data.to);
    if (toSocket) io.to(toSocket).emit("call:rejected", { from: fromUserId });
  });

  // ── Group call signaling ────────────────────────────────────────
  // Simple approach: caller notifies all group members via group room
  socket.on("group:call:start", async (data) => {
    const fromUserId = socketToUser.get(socket.id);
    let callerName = data.callerName || "Someone";
    try {
      const User   = mongoose.model("User");
      const caller = await User.findById(fromUserId, "firstName lastName username").lean();
      if (caller) callerName = [caller.firstName, caller.lastName].filter(Boolean).join(" ") || caller.username || callerName;
    } catch {}
    // Notify all other members in the group room
    socket.to("group:" + data.groupId).emit("group:call:incoming", {
      groupId:    data.groupId,
      groupName:  data.groupName || "Group",
      from:       fromUserId,
      callerName,
      isVideo:    !!data.isVideo,
    });
  });

  socket.on("group:call:join", (data) => {
    const fromUserId = socketToUser.get(socket.id);
    socket.to("group:" + data.groupId).emit("group:call:joined", {
      userId: fromUserId, groupId: data.groupId,
    });
  });

  socket.on("group:call:end", (data) => {
    const fromUserId = socketToUser.get(socket.id);
    socket.to("group:" + data.groupId).emit("group:call:ended", {
      by: fromUserId, groupId: data.groupId,
    });
  });

  // Legacy events (VideoCall.jsx backward compat)
  socket.on("callUser",     (data) => { const t = getSocket(data.to); if (t) io.to(t).emit("callUser",     { ...data, from: socketToUser.get(socket.id) }); });
  socket.on("callAccepted", (data) => { const t = getSocket(data.to); if (t) io.to(t).emit("callAccepted", { ...data, from: socketToUser.get(socket.id) }); });
  socket.on("callRejected", (data) => { const t = getSocket(data.to); if (t) io.to(t).emit("callRejected", { ...data, from: socketToUser.get(socket.id) }); });
  socket.on("iceCandidate", (data) => { const t = getSocket(data.to); if (t) io.to(t).emit("iceCandidate", { ...data, from: socketToUser.get(socket.id) }); });
  socket.on("endCall",      (data) => { const t = getSocket(data.to); if (t) io.to(t).emit("endCall",      { ...data, from: socketToUser.get(socket.id) }); });

  // ── Online list ─────────────────────────────────────────────────
  socket.on("getOnline", () => socket.emit("onlineList", [...onlineMap.keys()]));

  // ── Disconnect ──────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const userId = socketToUser.get(socket.id);
    if (userId) {
      socketToUser.delete(socket.id);
      const sockets = onlineMap.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          // Last socket for this user — they're fully offline
          onlineMap.delete(userId);
          io.emit("userOffline", userId);
          mongoose.model("User").findByIdAndUpdate(userId, { lastSeen: new Date() }).catch(() => {});
        }
      }
    }
  });
});

connectDB().then(async () => {
  const User = mongoose.model("User");
  await userTrie.rebuild(User);
  server.listen(5000, () => console.log("✅ ChatSphere server running on :5000"));
});