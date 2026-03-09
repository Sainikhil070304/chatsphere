const express        = require("express");
const router         = express.Router();
const mongoose       = require("mongoose");
const User           = mongoose.model("User");
const authMiddleware = require("../middleware/authMiddleware");

// DSA: name helper — O(1), no displayName dependency
const userName = (u) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || "User";

// ── GET ALL USERS (A-Z) ───────────────────────────────────────────────────────
router.get("/", authMiddleware, async (req, res) => {
  try {
    const me      = await User.findById(req.user.id).select("blockedUsers").lean();
    const blocked = (me?.blockedUsers || []).map(String);

    const users = await User.find({
      _id:      { $ne: req.user.id, $nin: blocked },
      isBanned: { $ne: true },
    })
      .select("firstName lastName username avatar isOnline isPrivate lastSeen followers following")
      .lean();

    // DSA: sort A-Z by firstName+lastName — O(n log n)
    users.sort((a, b) =>
      userName(a).toLowerCase().localeCompare(userName(b).toLowerCase())
    );

    res.json(users);
  } catch (err) {
    console.error("Get users error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Search users ──────────────────────────────────────────────────────────────
router.get("/search", authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const me      = await User.findById(req.user.id).select("blockedUsers").lean();
    const blocked = (me?.blockedUsers || []).map(String);

    const users = await User.find({
      _id: { $ne: req.user.id, $nin: blocked },
      $or: [
        { username:    { $regex: q, $options: "i" } },
        { firstName:   { $regex: q, $options: "i" } },
        { lastName:    { $regex: q, $options: "i" } },
        { displayName: { $regex: q, $options: "i" } },
      ],
    })
      .select("firstName lastName username avatar isOnline isPrivate")
      .limit(20)
      .lean();

    res.json(users);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── Get user profile by username ──────────────────────────────────────────────
router.get("/profile/:username", authMiddleware, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select("-password -publicKey")
      .populate("followers following", "username firstName lastName avatar isOnline")
      .lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    const me          = await User.findById(req.user.id).select("blockedUsers following sentRequests").lean();
    const isFollowing = (me?.following || []).map(String).includes(String(user._id));
    const isPending   = (me?.sentRequests || []).map(String).includes(String(user._id));

    res.json({ ...user, isFollowing, isPending });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── PING = Follow / Send request ─────────────────────────────────────────────
router.post("/ping/:targetId", authMiddleware, async (req, res) => {
  try {
    const me     = await User.findById(req.user.id);
    const target = await User.findById(req.params.targetId);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (String(me._id) === String(target._id))
      return res.status(400).json({ error: "Cannot ping yourself" });
    if ((me.following || []).map(String).includes(String(target._id)))
      return res.status(400).json({ error: "Already following" });

    if (target.isPrivate) {
      me.sentRequests    = me.sentRequests    || [];
      target.pendingRequests = target.pendingRequests || [];
      if (!me.sentRequests.map(String).includes(String(target._id))) {
        me.sentRequests.push(target._id);
        target.pendingRequests.push(me._id);
      }
      await me.save(); await target.save();
      return res.json({ status: "requested" });
    } else {
      me.following     = me.following     || [];
      target.followers = target.followers || [];
      me.following.push(target._id);
      target.followers.push(me._id);
      await me.save(); await target.save();
      return res.json({ status: "following" });
    }
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── UNPING = Unfollow ─────────────────────────────────────────────────────────
router.post("/unping/:targetId", authMiddleware, async (req, res) => {
  try {
    const me     = await User.findById(req.user.id);
    const target = await User.findById(req.params.targetId);
    if (!target) return res.status(404).json({ error: "User not found" });

    me.following           = (me.following           || []).filter(id => String(id) !== String(target._id));
    me.sentRequests        = (me.sentRequests        || []).filter(id => String(id) !== String(target._id));
    target.followers       = (target.followers       || []).filter(id => String(id) !== String(me._id));
    target.pendingRequests = (target.pendingRequests || []).filter(id => String(id) !== String(me._id));

    await me.save(); await target.save();
    res.json({ status: "unpinged" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── Accept follow request ─────────────────────────────────────────────────────
router.post("/accept/:requesterId", authMiddleware, async (req, res) => {
  try {
    const me        = await User.findById(req.user.id);
    const requester = await User.findById(req.params.requesterId);
    if (!requester) return res.status(404).json({ error: "Not found" });

    me.pendingRequests = (me.pendingRequests || []).filter(id => String(id) !== String(requester._id));
    if (!(me.followers || []).map(String).includes(String(requester._id))) {
      me.followers = me.followers || [];
      me.followers.push(requester._id);
    }
    requester.sentRequests = (requester.sentRequests || []).filter(id => String(id) !== String(me._id));
    if (!(requester.following || []).map(String).includes(String(me._id))) {
      requester.following = requester.following || [];
      requester.following.push(me._id);
    }
    await me.save(); await requester.save();
    res.json({ status: "accepted" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── Decline follow request ────────────────────────────────────────────────────
router.post("/decline/:requesterId", authMiddleware, async (req, res) => {
  try {
    const me        = await User.findById(req.user.id);
    const requester = await User.findById(req.params.requesterId);
    if (!requester) return res.status(404).json({ error: "Not found" });
    me.pendingRequests     = (me.pendingRequests     || []).filter(id => String(id) !== String(requester._id));
    requester.sentRequests = (requester.sentRequests || []).filter(id => String(id) !== String(me._id));
    await me.save(); await requester.save();
    res.json({ status: "declined" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── Block user ────────────────────────────────────────────────────────────────
router.post("/block/:targetId", authMiddleware, async (req, res) => {
  try {
    const me     = await User.findById(req.user.id);
    const target = await User.findById(req.params.targetId);
    if (!target) return res.status(404).json({ error: "Not found" });

    // Remove from both sides of social graph
    me.following           = (me.following           || []).filter(id => String(id) !== String(target._id));
    me.followers           = (me.followers           || []).filter(id => String(id) !== String(target._id));
    me.sentRequests        = (me.sentRequests        || []).filter(id => String(id) !== String(target._id));
    me.pendingRequests     = (me.pendingRequests     || []).filter(id => String(id) !== String(target._id));
    target.following       = (target.following       || []).filter(id => String(id) !== String(me._id));
    target.followers       = (target.followers       || []).filter(id => String(id) !== String(me._id));
    target.sentRequests    = (target.sentRequests    || []).filter(id => String(id) !== String(me._id));
    target.pendingRequests = (target.pendingRequests || []).filter(id => String(id) !== String(me._id));

    me.blockedUsers = me.blockedUsers || [];
    if (!me.blockedUsers.map(String).includes(String(target._id)))
      me.blockedUsers.push(target._id);

    await me.save(); await target.save();
    res.json({ status: "blocked" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── Unblock user ──────────────────────────────────────────────────────────────
router.post("/unblock/:targetId", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.user.id);
    me.blockedUsers = (me.blockedUsers || []).filter(id => String(id) !== req.params.targetId);
    await me.save();
    res.json({ status: "unblocked" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// ── Get my pending requests ───────────────────────────────────────────────────
router.get("/me/requests", authMiddleware, async (req, res) => {
  try {
    const me = await User.findById(req.user.id)
      .populate("pendingRequests", "username firstName lastName avatar isOnline").lean();
    res.json(me?.pendingRequests || []);
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;