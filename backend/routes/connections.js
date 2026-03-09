// routes/connections.js
// ════════════════════════════════════════════════════════════════
// OOP: ConnectionManager class — handles all request logic
// DSA: HashMap for O(1) status lookups, Set for bulk checks
// ════════════════════════════════════════════════════════════════
const router  = require("express").Router();
const Request = require("../models/ConnectionRequest");
const User    = require("../models/User");
const auth    = require("../middleware/authMiddleware");

// ── OOP: ConnectionManager ───────────────────────────────────────
class ConnectionManager {
  // Get status between two users: none|pending_sent|pending_received|connected
  static async getStatus(meId, otherId) {
    const me = String(meId), other = String(otherId);
    // DSA: parallel queries with Promise.all — O(1) indexed lookup each
    const [sent, received] = await Promise.all([
      Request.findOne({ sender: me, receiver: other }),
      Request.findOne({ sender: other, receiver: me }),
    ]);
    if (sent?.status === "accepted" || received?.status === "accepted")
      return { status: "connected", requestId: (sent || received)?._id };
    if (sent?.status === "pending")
      return { status: "pending_sent", requestId: sent._id };
    if (received?.status === "pending")
      return { status: "pending_received", requestId: received._id };
    if (sent?.status === "rejected")
      return { status: "rejected_sent", requestId: sent._id };
    return { status: "none" };
  }

  // Bulk: get statuses for a list of userIds (for chat list)
  // DSA: single DB query + HashMap build = O(n)
  static async getBulkStatus(meId, otherIds) {
    const me = String(meId);
    const ids = otherIds.map(String);
    const [sent, received] = await Promise.all([
      Request.find({ sender: me, receiver: { $in: ids } }).lean(),
      Request.find({ sender: { $in: ids }, receiver: me }).lean(),
    ]);
    // Build HashMap: otherId → status
    const map = new Map();
    for (const r of sent)     map.set(String(r.receiver), r.status === "accepted" ? "connected" : r.status === "pending" ? "pending_sent" : "none");
    for (const r of received) {
      const key = String(r.sender);
      if (!map.has(key) || map.get(key) === "none")
        map.set(key, r.status === "accepted" ? "connected" : r.status === "pending" ? "pending_received" : "none");
    }
    return map;
  }
}

// ── SEND request ─────────────────────────────────────────────────
router.post("/send/:userId", auth, async (req, res) => {
  try {
    const { userId } = req.params;
    if (userId === req.user.id) return res.status(400).json({ msg: "Can't send to yourself" });

    const target = await User.findById(userId);
    if (!target) return res.status(404).json({ msg: "User not found" });

    const existing = await ConnectionManager.getStatus(req.user.id, userId);
    if (existing.status === "connected")        return res.status(400).json({ msg: "Already connected" });
    if (existing.status === "pending_sent")     return res.status(400).json({ msg: "Request already sent" });
    if (existing.status === "pending_received") return res.status(400).json({ msg: "They already sent you a request — accept it!" });

    // Remove old rejected request if exists (allow re-request)
    await Request.deleteOne({ sender: req.user.id, receiver: userId });

    await Request.create({ sender: req.user.id, receiver: userId });
    res.json({ msg: "Connection request sent!", status: "pending_sent" });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ msg: "Request already exists" });
    res.status(500).json({ msg: e.message });
  }
});

// ── ACCEPT request ────────────────────────────────────────────────
router.post("/accept/:requestId", auth, async (req, res) => {
  try {
    const request = await Request.findById(req.params.requestId);
    if (!request) return res.status(404).json({ msg: "Request not found" });
    if (String(request.receiver) !== req.user.id) return res.status(403).json({ msg: "Not your request" });
    if (request.status !== "pending") return res.status(400).json({ msg: "Request already handled" });

    request.status = "accepted";
    await request.save();

    // Also add to each other's following (so posts are visible)
    await Promise.all([
      User.findByIdAndUpdate(req.user.id,           { $addToSet: { following: request.sender,   followers: request.receiver } }),
      User.findByIdAndUpdate(String(request.sender),{ $addToSet: { following: request.receiver, followers: request.sender   } }),
    ]);

    res.json({ msg: "Connected! You can now chat.", status: "connected" });
  } catch (e) { res.status(500).json({ msg: e.message }); }
});

// ── REJECT request ────────────────────────────────────────────────
router.post("/reject/:requestId", auth, async (req, res) => {
  try {
    const request = await Request.findById(req.params.requestId);
    if (!request) return res.status(404).json({ msg: "Request not found" });
    if (String(request.receiver) !== req.user.id) return res.status(403).json({ msg: "Not your request" });
    request.status = "rejected";
    await request.save();
    res.json({ msg: "Request rejected" });
  } catch (e) { res.status(500).json({ msg: e.message }); }
});

// ── CANCEL request (sender withdraws) ────────────────────────────
router.delete("/cancel/:userId", auth, async (req, res) => {
  try {
    await Request.deleteOne({ sender: req.user.id, receiver: req.params.userId, status: "pending" });
    res.json({ msg: "Request cancelled", status: "none" });
  } catch (e) { res.status(500).json({ msg: e.message }); }
});

// ── DISCONNECT (remove connection) ────────────────────────────────
router.delete("/disconnect/:userId", auth, async (req, res) => {
  try {
    await Request.deleteMany({
      $or: [
        { sender: req.user.id, receiver: req.params.userId },
        { sender: req.params.userId, receiver: req.user.id },
      ]
    });
    // Remove from following/followers both ways
    await Promise.all([
      User.findByIdAndUpdate(req.user.id,          { $pull: { following: req.params.userId, followers: req.params.userId } }),
      User.findByIdAndUpdate(req.params.userId,    { $pull: { following: req.user.id,      followers: req.user.id      } }),
    ]);
    res.json({ msg: "Disconnected", status: "none" });
  } catch (e) { res.status(500).json({ msg: e.message }); }
});

// ── GET status with one user ───────────────────────────────────────
router.get("/status/:userId", auth, async (req, res) => {
  try {
    const result = await ConnectionManager.getStatus(req.user.id, req.params.userId);
    res.json(result);
  } catch (e) { res.status(500).json({ msg: e.message }); }
});

// ── GET pending requests (incoming) ───────────────────────────────
router.get("/pending", auth, async (req, res) => {
  try {
    const requests = await Request.find({ receiver: req.user.id, status: "pending" })
      .populate("sender", "firstName lastName username avatar bio")
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (e) { res.status(500).json({ msg: e.message }); }
});

// ── GET all connected users ───────────────────────────────────────
router.get("/connected", auth, async (req, res) => {
  try {
    const [sent, received] = await Promise.all([
      Request.find({ sender: req.user.id, status: "accepted" }).populate("receiver", "firstName lastName username avatar"),
      Request.find({ receiver: req.user.id, status: "accepted" }).populate("sender",   "firstName lastName username avatar"),
    ]);
    const users = [
      ...sent.map(r => r.receiver),
      ...received.map(r => r.sender),
    ].filter(Boolean);
    res.json(users);
  } catch (e) { res.status(500).json({ msg: e.message }); }
});

module.exports = router;