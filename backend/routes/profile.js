const router  = require("express").Router();
const User    = require("../models/User");
const auth    = require("../middleware/authMiddleware");
const multer  = require("multer");

// Use memory storage — no disk needed, works on Render free tier
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images allowed"));
  },
});

// GET my profile
router.get("/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password -otpCode -otpExpires");
    res.json(user);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET any user profile by username
router.get("/:username", auth, async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select("-password -otpCode -otpExpires -email");
    if (!user) return res.status(404).json({ msg: "User not found" });
    res.json(user);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// UPDATE profile
router.put("/me", auth, async (req, res) => {
  try {
    const { firstName, middleName, lastName, bio, username } = req.body;
    const updates = {};
    if (firstName)            updates.firstName  = firstName.trim();
    if (middleName !== undefined) updates.middleName = middleName.trim();
    if (lastName)             updates.lastName   = lastName.trim();
    if (bio !== undefined)    updates.bio        = bio.slice(0, 150);
    if (username) {
      const clean = username.toLowerCase().trim();
      if (!/^[a-z0-9_.]{3,20}$/.test(clean))
        return res.status(400).json({ msg: "Invalid username format" });
      const exists = await User.findOne({ username: clean, _id: { $ne: req.user.id } });
      if (exists) return res.status(400).json({ msg: "Username already taken" });
      updates.username = clean;
    }
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true })
      .select("-password");
    res.json(user);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// UPLOAD avatar — stored as base64 data URL in MongoDB
// Works on Render free tier (no disk persistence needed)
router.post("/avatar", auth, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: "No file uploaded" });

    // Convert to base64 data URL
    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatar: base64 },
      { new: true }
    ).select("-password");

    res.json({ avatar: user.avatar, user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// BLOCK user
router.post("/block/:userId", auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $addToSet: { blockedUsers: req.params.userId } });
    res.json({ msg: "User blocked" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// UNBLOCK user
router.post("/unblock/:userId", auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, { $pull: { blockedUsers: req.params.userId } });
    res.json({ msg: "User unblocked" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET blocked users
router.get("/me/blocked", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate("blockedUsers", "username firstName lastName avatar");
    res.json(user.blockedUsers);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// SAVE public key
router.post("/publickey", auth, async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) return res.status(400).json({ msg: "publicKey required" });
    await User.findByIdAndUpdate(req.user.id, { publicKey });
    res.json({ msg: "Public key saved" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;