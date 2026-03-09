const router  = require("express").Router();
const Group   = require("../models/Group");
const Message = require("../models/Message");
const User    = require("../models/User");
const auth    = require("../middleware/authMiddleware");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const { messageCache } = require("../dsa/LRUCache");

// ── Group avatar upload ────────────────────────────────
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/groups");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});
const uploadAvatar = multer({ storage: avatarStorage, limits: { fileSize: 5 * 1024 * 1024 } });

// ── GET my groups ──────────────────────────────────────
router.get("/", auth, async (req, res) => {
  try {
    const groups = await Group.find({ members: req.user.id })
      .populate("members", "firstName lastName username avatar publicKey")
      .populate("admin",   "firstName lastName username avatar")
      .sort({ updatedAt: -1 });
    res.json(groups);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET single group ───────────────────────────────────
router.get("/info/:groupId", auth, async (req, res) => {
  try {
    const g = await Group.findById(req.params.groupId)
      .populate("members", "firstName lastName username avatar publicKey")
      .populate("admin",   "firstName lastName username avatar");
    if (!g) return res.status(404).json({ msg: "Not found" });
    if (!g.members.map(m => String(m._id)).includes(req.user.id))
      return res.status(403).json({ msg: "Not a member" });
    res.json(g);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── CREATE group ───────────────────────────────────────
// encryptedKeys: { userId: encryptedAESKey, ... }  — sent by client
router.post("/create", auth, async (req, res) => {
  try {
    const { name, members, encryptedKeys } = req.body;
    if (!name || !members?.length) return res.status(400).json({ msg: "Name and members required" });
    const allMembers = [...new Set([req.user.id, ...members])];
    const group = await Group.create({
      name: name.trim(), admin: req.user.id, members: allMembers,
      encryptedKeys: encryptedKeys || {},
    });
    const populated = await Group.findById(group._id)
      .populate("members", "firstName lastName username avatar publicKey")
      .populate("admin",   "firstName lastName username avatar");
    res.status(201).json(populated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── UPLOAD group avatar (admin only) ──────────────────
router.post("/avatar/:groupId", auth, uploadAvatar.single("avatar"), async (req, res) => {
  try {
    const g = await Group.findById(req.params.groupId);
    if (!g) return res.status(404).json({ msg: "Not found" });
    if (String(g.admin) !== req.user.id) return res.status(403).json({ msg: "Admin only" });
    if (!req.file) return res.status(400).json({ msg: "No file" });
    const avatarUrl = `/uploads/groups/${req.file.filename}`;
    await Group.findByIdAndUpdate(req.params.groupId, { avatar: avatarUrl });
    res.json({ avatar: avatarUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── ADD member (admin only) ────────────────────────────
router.post("/add-member/:groupId", auth, async (req, res) => {
  try {
    const { memberId, encryptedKey } = req.body;
    const g = await Group.findById(req.params.groupId);
    if (!g) return res.status(404).json({ msg: "Not found" });
    if (String(g.admin) !== req.user.id) return res.status(403).json({ msg: "Admin only" });
    if (g.members.map(String).includes(memberId)) return res.status(400).json({ msg: "Already a member" });
    g.members.push(memberId);
    if (encryptedKey) g.encryptedKeys.set(memberId, encryptedKey);
    await g.save();
    const updated = await Group.findById(req.params.groupId)
      .populate("members", "firstName lastName username avatar publicKey")
      .populate("admin",   "firstName lastName username avatar");
    res.json(updated);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── REMOVE member (admin only) ─────────────────────────
router.post("/remove-member/:groupId", auth, async (req, res) => {
  try {
    const { memberId } = req.body;
    const g = await Group.findById(req.params.groupId);
    if (!g) return res.status(404).json({ msg: "Not found" });
    if (String(g.admin) !== req.user.id) return res.status(403).json({ msg: "Admin only" });
    if (String(memberId) === req.user.id) return res.status(400).json({ msg: "Can't remove yourself" });
    g.members = g.members.filter(m => String(m) !== String(memberId));
    g.encryptedKeys.delete(memberId);
    await g.save();
    res.json({ msg: "Removed" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── LEAVE group ────────────────────────────────────────
router.post("/leave/:groupId", auth, async (req, res) => {
  try {
    const g = await Group.findById(req.params.groupId);
    if (!g) return res.status(404).json({ msg: "Not found" });
    if (!g.members.map(String).includes(req.user.id)) return res.status(403).json({ msg: "Not a member" });
    if (String(g.admin) === req.user.id) {
      const remaining = g.members.filter(m => String(m) !== req.user.id);
      if (!remaining.length) { await Group.findByIdAndDelete(req.params.groupId); return res.json({ msg: "Group deleted", deleted: true }); }
      g.admin = remaining[0];
    }
    g.members = g.members.filter(m => String(m) !== req.user.id);
    g.encryptedKeys.delete(req.user.id);
    await g.save();
    res.json({ msg: "Left" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE group (admin) ───────────────────────────────
router.delete("/delete/:groupId", auth, async (req, res) => {
  try {
    const g = await Group.findById(req.params.groupId);
    if (!g) return res.status(404).json({ msg: "Not found" });
    if (String(g.admin) !== req.user.id) return res.status(403).json({ msg: "Admin only" });
    await Group.findByIdAndDelete(req.params.groupId);
    await Message.deleteMany({ chatId: req.params.groupId });
    res.json({ msg: "Deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── SEND message ───────────────────────────────────────
router.post("/message", auth, async (req, res) => {
  try {
    const { groupId, encrypted, type = "text" } = req.body;
    const g = await Group.findById(groupId);
    if (!g) return res.status(404).json({ msg: "Not found" });
    if (!g.members.map(String).includes(req.user.id)) return res.status(403).json({ msg: "Not a member" });
    const msg = await Message.create({ chatId: groupId, encrypted, sender: req.user.id, type, status: "sent" });
    await Group.findByIdAndUpdate(groupId, { lastMessage: type === "image" ? " Image" : type === "audio" ? " Voice" : " Message", updatedAt: Date.now() });
    messageCache.invalidate("g:" + groupId);
    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET messages ───────────────────────────────────────
router.get("/messages/:groupId", auth, async (req, res) => {
  try {
    const msgs = await Message.find({ chatId: req.params.groupId })
      .populate("sender", "_id firstName username avatar")
      .sort({ createdAt: 1 });
    res.json(msgs.map(m => ({
      _id: m._id, sender: m.sender, encrypted: m.encrypted,
      type: m.type || "text", status: m.status, createdAt: m.createdAt,
      senderName: m.sender?.firstName || m.sender?.username || "",
      senderAvatar: m.sender?.avatar || "",
      unsent: m.unsent || false,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── UNSEND message (within 1 hour) ────────────────────
router.delete("/message/:msgId", auth, async (req, res) => {
  try {
    const msg = await Message.findById(req.params.msgId);
    if (!msg) return res.status(404).json({ msg: "Not found" });
    if (String(msg.sender) !== req.user.id && String(msg.sender?._id) !== req.user.id)
      return res.status(403).json({ msg: "Not your message" });
    if (Date.now() - new Date(msg.createdAt).getTime() > 3600000)
      return res.status(400).json({ msg: "1 hour limit passed" });
    await Message.findByIdAndUpdate(req.params.msgId, { encrypted: "UNSENT", unsent: true });
    messageCache.invalidate("g:" + msg.chatId);
    res.json({ msgId: req.params.msgId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;