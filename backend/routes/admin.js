// backend/routes/admin.js
const router = require("express").Router();
const User = require("../models/User");
const Message = require("../models/Message");
const Chat = require("../models/Chat");
const auth = require("../middleware/authMiddleware");
const { userTrie } = require("../dsa/TrieSearch");

// Admin middleware
const isAdmin = async (req, res, next) => {
  const user = await User.findById(req.user.id);
  if (!user?.isAdmin) return res.status(403).json({ msg: "Admin access required" });
  next();
};

// GET all users
router.get("/users", auth, isAdmin, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE user
router.delete("/users/:id", auth, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: "User not found" });
    userTrie.remove(user.username); // remove from Trie
    await User.findByIdAndDelete(req.params.id);
    await Message.deleteMany({ sender: req.params.id });
    res.json({ msg: "User deleted" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// BAN / UNBAN user
router.patch("/users/:id/ban", auth, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: "User not found" });
    user.isBanned = !user.isBanned;
    await user.save();
    res.json({ msg: user.isBanned ? "User banned" : "User unbanned", isBanned: user.isBanned });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// MAKE ADMIN
router.patch("/users/:id/admin", auth, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    user.isAdmin = !user.isAdmin;
    await user.save();
    res.json({ msg: user.isAdmin ? "Made admin" : "Removed admin", isAdmin: user.isAdmin });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// STATS
router.get("/stats", auth, isAdmin, async (req, res) => {
  try {
    const [users, messages, chats] = await Promise.all([
      User.countDocuments(),
      Message.countDocuments(),
      Chat.countDocuments(),
    ]);
    const banned = await User.countDocuments({ isBanned: true });
    const today = new Date(); today.setHours(0,0,0,0);
    const newToday = await User.countDocuments({ createdAt: { $gte: today } });
    res.json({ users, messages, chats, banned, newToday });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
