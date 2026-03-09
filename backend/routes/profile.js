// backend/routes/profile.js
const router = require("express").Router();
const User = require("../models/User");
const auth = require("../middleware/authMiddleware");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Local storage for avatars
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../uploads/avatars");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${req.user.id}-${Date.now()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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
    if (firstName) updates.firstName = firstName.trim();
    if (middleName !== undefined) updates.middleName = middleName.trim();
    if (lastName) updates.lastName = lastName.trim();
    if (bio !== undefined) updates.bio = bio.slice(0, 150);
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

// UPLOAD avatar
router.post("/avatar", auth, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ msg: "No file uploaded" });
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { avatar: avatarUrl },
      { new: true }
    ).select("-password");
    res.json({ avatar: user.avatar, user });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// BLOCK user
router.post("/block/:userId", auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { blockedUsers: req.params.userId }
    });
    res.json({ msg: "User blocked" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// UNBLOCK user
router.post("/unblock/:userId", auth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { blockedUsers: req.params.userId }
    });
    res.json({ msg: "User unblocked" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET blocked users
router.get("/me/blocked", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate("blockedUsers", "username firstName lastName avatar");
    res.json(user.blockedUsers);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

// SAVE public key (called after RSA key generation on login)
router.post("/publickey", auth, async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) return res.status(400).json({ msg: "publicKey required" });
    await User.findByIdAndUpdate(req.user.id, { publicKey });
    res.json({ msg: "Public key saved" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
