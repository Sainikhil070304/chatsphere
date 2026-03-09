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
// DSA: HashMap O(1) userId→socketId and reverse socketId→userId
// DSA: HashMap O(1) for typing debounce timers
// ══════════════════════════════════════════════════════════════════
const onlineMap    = new Map();  // userId  → socketId
const socketToUser = new Map();  // socketId → userId
const typingTimers = new Map();  // debounce key → timeout

io.on("connection", (socket) => {

  // ── Online ──────────────────────────────────────────────────────
  socket.on("online", async (userId) => {
    onlineMap.set(String(userId), socket.id);
    socketToUser.set(socket.id, String(userId));
    io.emit("userOnline", userId);

    // Join all group rooms — O(n groups) once on connect
    try {
      const Group  = mongoose.model("Group");
      const groups = await Group.find({ members: userId }, "_id").lean();
      groups.forEach(g => socket.join("group:" + g._id));
    } catch {}

    // Flush offline queue (DSA: FIFO Queue)
    if (messageQueue.hasMessages(userId))
      messageQueue.flush(userId).forEach(m => socket.emit("receive", m));
  });

  // ── Send message ────────────────────────────────────────────────
  socket.on("send", (data) => {
    const check = messageLimiter.isAllowed(data.from);
    if (!check.allowed) { socket.emit("rateLimited", { msg: `Retry in ${check.retryAfter}s` }); return; }

    const payload = {
      encrypted: data.encrypted,
      from:      data.from,
      type:      data.type,
      msgId:     data.msgId,
      groupId:   data.groupId,
      senderName: data.senderName,
    };

    if (data.isGroup && data.groupId) {
      socket.to("group:" + data.groupId).emit("receive", payload);
    } else {
      const toSocket = onlineMap.get(String(data.to));
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
      const toSocket = onlineMap.get(String(to));
      if (toSocket) io.to(toSocket).emit("messageUnsent", { msgId });
    }
  });

  // ── Seen ────────────────────────────────────────────────────────
  socket.on("seen", ({ msgId, to }) => {
    const toSocket = onlineMap.get(String(to));
    if (toSocket) io.to(toSocket).emit("msgSeen", { msgId });
  });

  // ── Typing (debounced with HashMap) ────────────────────────────
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
      const toSocket    = onlineMap.get(String(recipientId));
      if (!toSocket) return;
      const key = `${fromUserId}:${recipientId}`;
      if (typingTimers.has(key)) return;
      io.to(toSocket).emit("typing", { from: fromUserId, name: data.name });
      typingTimers.set(key, setTimeout(() => typingTimers.delete(key), 800));
    }
  });

  socket.on("stopTyping", (data) => {
    const fromUserId = socketToUser.get(socket.id);
    if (!fromUserId) return;
    if (typeof data === "object" && data.groupId) {
      socket.to("group:" + data.groupId).emit("stopTyping", { from: fromUserId });
    } else {
      const toSocket = onlineMap.get(String(typeof data === "object" ? data.to : data));
      if (toSocket) io.to(toSocket).emit("stopTyping", { from: fromUserId });
    }
  });

  // ══════════════════════════════════════════════════════════════════
  // WebRTC Signalling — O(1) HashMap lookup via getSocket()
  //
  // CALL FLOW:
  //   1. Caller → "call:offer"    → server sends "call:incoming" to callee (banner)
  //                               → DOES NOT double-send call:offer (callee requests)
  //   2. Callee accepts           → emits "call:request:offer" to get the offer
  //   3. Server sends offer       → callee creates answer → "call:answer" → caller
  //   4. Both exchange "call:ice" candidates (trickle ICE)
  //   5. Either → "call:end"      → other gets "call:ended"
  // ══════════════════════════════════════════════════════════════════

  // Store pending offers so callee can fetch after accepting
  // DSA: HashMap O(1) - callerId → offer data
  const pendingOffers = new Map();

  socket.on("call:offer", async (data) => {
    const fromUserId = socketToUser.get(socket.id);
    const toSocket   = getSocket(data.to);
    if (!toSocket) return;

    // Store offer for callee to pick up after accepting
    pendingOffers.set(String(data.to) + ":" + String(fromUserId), {
      ...data, from: fromUserId,
    });

    // Look up caller name from DB
    let callerName = data.callerName || "Someone";
    try {
      const User   = mongoose.model("User");
      const caller = await User.findById(fromUserId, "firstName lastName username").lean();
      if (caller) callerName = [caller.firstName, caller.lastName].filter(Boolean).join(" ") || caller.username || callerName;
    } catch {}

    // Send incoming call notification (banner only — no SDP yet)
    io.to(toSocket).emit("call:incoming", {
      from: fromUserId, fromName: callerName, callerName,
      callType: data.isVideo ? "video" : "voice",
      isVideo:  !!data.isVideo,
    });
  });

  // Callee accepted — send the stored offer
  socket.on("call:accept", (data) => {
    const fromUserId = socketToUser.get(socket.id);
    const key        = String(fromUserId) + ":" + String(data.from);
    const offer      = pendingOffers.get(key);
    if (!offer) return;
    pendingOffers.delete(key);
    socket.emit("call:offer", offer); // send offer to callee
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
    emitToUser(data.to, "call:ended", { from: fromUserId });
    // Clean up pending offer if call ended before answer
    pendingOffers.delete(String(data.to) + ":" + String(fromUserId));
  });

  socket.on("call:rejected", (data) => {
    const fromUserId = socketToUser.get(socket.id);
    const toSocket   = getSocket(data.to);
    if (toSocket) io.to(toSocket).emit("call:rejected", { from: fromUserId });
    pendingOffers.delete(String(fromUserId) + ":" + String(data.to));
  });

  // Legacy WebRTC events (backward compat)
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
      onlineMap.delete(userId);
      socketToUser.delete(socket.id);
      io.emit("userOffline", userId);
      mongoose.model("User").findByIdAndUpdate(userId, { lastSeen: new Date() }).catch(() => {});
    }
  });
});

connectDB().then(async () => {
  const User = mongoose.model("User");
  await userTrie.rebuild(User);
  server.listen(5000, () => console.log("✅ ChatSphere server running on :5000"));
});