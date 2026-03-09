const router  = require("express").Router();
const Chat    = require("../models/Chat");
const Message = require("../models/Message");
const auth    = require("../middleware/authMiddleware");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const { messageCache } = require("../dsa/LRUCache");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/chat");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Create or find chat
router.post("/create", auth, async (req, res) => {
  try {
    let chat = await Chat.findOne({
      members: { $all: [req.user.id, req.body.userId], $size: 2 },
    });
    if (!chat) chat = await Chat.create({ members: [req.user.id, req.body.userId] });
    res.json(chat);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Upload file/image/audio
router.post("/upload", auth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  res.json({
    url:      `/uploads/chat/${req.file.filename}`,
    name:     req.file.originalname,
    size:     req.file.size,
    mimetype: req.file.mimetype,
  });
});

// Save message
router.post("/", auth, async (req, res) => {
  try {
    const { chat, encrypted, type = "text" } = req.body;
    if (!chat || !encrypted) return res.status(400).json({ error: "Missing fields" });
    const msg = await Message.create({ chatId: chat, encrypted, sender: req.user.id, type, status: "sent" });
    await Chat.findByIdAndUpdate(chat, {
      lastMessage: type === "image" ? "📷 Image" : type === "audio" ? "🎤 Voice" : "💬 Message",
      updatedAt: Date.now(),
    });
    messageCache.invalidate(chat);
    res.json(msg);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// List all DM chats for current user
router.get("/", auth, async (req, res) => {
  try {
    const chats = await Chat.find({ members: req.user.id })
      .populate("members", "_id firstName lastName username avatar")
      .sort({ updatedAt: -1 });
    res.json(chats);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get messages — filtered by clearedAt for this user (WhatsApp-style)
router.get("/:chatId", auth, async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findById(chatId);

    // Only show messages after user's clear timestamp
    const clearedAt = chat?.clearedAt?.get(req.user.id) || null;
    const query = { chatId };
    if (clearedAt) query.createdAt = { $gt: clearedAt };

    const msgs = await Message.find(query)
      .populate("sender", "_id firstName username avatar")
      .sort({ createdAt: 1 });

    await Message.updateMany(
      { chatId, sender: { $ne: req.user.id }, status: "sent" },
      { $set: { status: "delivered" } }
    );

    res.json(msgs.map(m => ({
      _id: m._id, sender: m.sender, encrypted: m.encrypted,
      type: m.type || "text", status: m.status, createdAt: m.createdAt,
      unsent: m.unsent || false,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Clear chat for current user only (WhatsApp-style)
router.post("/clear/:chatId", auth, async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (!chat.members.map(String).includes(req.user.id))
      return res.status(403).json({ error: "Not a member" });
    chat.clearedAt.set(req.user.id, new Date());
    await chat.save();
    messageCache.invalidate(req.params.chatId);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Mark as seen
router.post("/seen/:chatId", auth, async (req, res) => {
  try {
    await Message.updateMany(
      { chatId: req.params.chatId, sender: { $ne: req.user.id }, status: { $ne: "seen" } },
      { $set: { status: "seen" } }
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Unsend DM message
router.delete("/message/:msgId", auth, async (req, res) => {
  try {
    const msg = await Message.findById(req.params.msgId);
    if (!msg) return res.status(404).json({ msg: "Not found" });
    if (String(msg.sender) !== req.user.id && String(msg.sender?._id) !== req.user.id)
      return res.status(403).json({ msg: "Not your message" });
    if (Date.now() - new Date(msg.createdAt).getTime() > 3600000)
      return res.status(400).json({ msg: "1 hour limit passed" });
    await Message.findByIdAndUpdate(req.params.msgId, { encrypted: "UNSENT", unsent: true });
    messageCache.invalidate(msg.chatId?.toString());
    res.json({ msgId: req.params.msgId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;