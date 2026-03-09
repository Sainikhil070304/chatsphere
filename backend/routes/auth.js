require("dotenv").config();
const router   = require("express").Router();
const bcrypt   = require("bcryptjs");
const jwt      = require("jsonwebtoken");
const User     = require("../models/User");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");

const JWT_SECRET  = process.env.JWT_SECRET  || "chatsphere_jwt_secret_2024";
const ADMIN_EMAIL = "sainikhil0918@gmail.com";

// ════════════════════════════════════════════════════════════
// Email — Brevo SMTP (sends to ANY email, free 300/day)
// Set in Railway: BREVO_USER=your@email.com  BREVO_PASS=your-smtp-key
// ════════════════════════════════════════════════════════════
const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_PASS,
  },
});

const otpHtml = (name, otp, type = "verify") => {
  const accent = type === "reset" ? "#f87171" : "#a78bfa";
  const title  = type === "reset" ? `Reset your password, ${name}` : `Verify your email, ${name}`;
  const sub    = type === "reset" ? "Use this code to reset your password. Expires in 10 min." : "Enter this code in the app. Expires in 15 min.";
  return `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;background:#0a0d16;color:#fff;padding:40px;border-radius:20px;border:1px solid rgba(255,255,255,0.07)">
    <h1 style="color:${accent};font-size:26px;margin:0 0 8px;font-weight:900;text-align:center">ChatSphere</h1>
    <h2 style="font-size:18px;margin:0 0 8px">${title}</h2>
    <p style="color:#8b8ba0;margin:0 0 24px;font-size:14px;line-height:1.5">${sub}</p>
    <div style="background:rgba(255,255,255,0.04);border:1px solid ${accent}44;border-radius:14px;padding:28px;text-align:center;margin-bottom:24px">
      <div style="font-size:44px;letter-spacing:14px;font-weight:900;color:${accent};font-family:monospace">${otp}</div>
    </div>
    <p style="color:#4b4b60;font-size:12px;margin:0">If you didn't request this, ignore this email.</p>
  </div>`;
};

const sendEmail = async (to, subject, html) => {
  console.log(` EMAIL → ${to}`);
  // If Brevo not configured, log OTP to console (dev fallback)
  if (!process.env.BREVO_USER || !process.env.BREVO_PASS) {
    console.warn("⚠  BREVO_USER/BREVO_PASS not set — email not sent");
    return false;
  }
  try {
    await transporter.sendMail({
      from: `"ChatSphere" <${process.env.BREVO_USER}>`,
      to,
      subject,
      html,
    });
    console.log("✅ Email sent via Brevo");
    return true;
  } catch (e) {
    console.error("❌ Brevo error:", e?.message || e);
    return false;
  }
};

// ════════════════════════════════════════════════════════════
// MongoDB-backed OTP store — survives Railway restarts
// ════════════════════════════════════════════════════════════
const PendingSchema = new mongoose.Schema({
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  data:      { type: Object, required: true },
  otp:       { type: String, default: null },
  attempts:  { type: Number, default: 0 },
  expiresAt: { type: Date,   required: true },
});
PendingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Pending = mongoose.models.Pending || mongoose.model("Pending", PendingSchema);

const ResetSchema = new mongoose.Schema({
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  data:      { type: Object, required: true },
  otp:       { type: String, default: null },
  attempts:  { type: Number, default: 0 },
  expiresAt: { type: Date,   required: true },
});
ResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const Reset = mongoose.models.Reset || mongoose.model("Reset", ResetSchema);

// ════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════
const genOTP   = () => String(Math.floor(100000 + Math.random() * 900000));
const signJWT  = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: "7d" });
const norm     = (s) => String(s || "").toLowerCase().trim();
const expiry   = (ms) => new Date(Date.now() + ms);
const userView = u => ({
  _id: u._id, firstName: u.firstName, lastName: u.lastName,
  username: u.username, email: u.email, isAdmin: u.isAdmin,
  avatar: u.avatar, bio: u.bio, publicKey: u.publicKey,
});

// ════════════════════════════════════════════════════════════
// REGISTER
// ════════════════════════════════════════════════════════════
router.post("/register", async (req, res) => {
  try {
    const { firstName, middleName="", lastName, username, email, password, dob } = req.body;
    if (!firstName?.trim()||!lastName?.trim()||!username?.trim()||!email?.trim()||!password||!dob)
      return res.status(400).json({ msg: "All fields are required" });
    if (password.length < 6)
      return res.status(400).json({ msg: "Password must be at least 6 characters" });

    const age = Math.floor((Date.now() - new Date(dob)) / 31557600000);
    if (age < 13) return res.status(400).json({ msg: "You must be at least 13 years old" });

    const el = norm(email);
    const ul = norm(username);

    if (!/^[a-z0-9_]+$/.test(ul))
      return res.status(400).json({ msg: "Username: only letters, numbers, underscore" });

    const dup = await User.findOne({ $or:[{ email:el },{ username:ul }] });
    if (dup?.email === el)    return res.status(400).json({ msg: "Email already registered. Please login." });
    if (dup?.username === ul) return res.status(400).json({ msg: "Username already taken" });

    const hashed  = await bcrypt.hash(password, 12);
    const otp     = genOTP();
    const isAdmin = el === ADMIN_EMAIL;

    await Pending.findOneAndUpdate(
      { email: el },
      { data: { firstName, middleName, lastName, username:ul, email:el, password:hashed, dob, age, isAdmin },
        otp, attempts: 0, expiresAt: expiry(15 * 60 * 1000) },
      { upsert: true, new: true }
    );

    console.log(` REGISTER OTP for ${el}: ${otp}`);
    const sent = await sendEmail(el, "Your ChatSphere verification code", otpHtml(firstName, otp, "verify"));

    res.json({
      msg:    sent ? "Verification code sent! Check your email." : `Dev mode — OTP: ${otp}`,
      step:   "verify",
      email:  el,
      devOtp: !sent ? otp : undefined,  // show in response only if email failed
    });
  } catch (e) { console.error("REGISTER ERROR:", e); res.status(500).json({ msg: "Server error: " + e.message }); }
});

// ════════════════════════════════════════════════════════════
// VERIFY OTP
// ════════════════════════════════════════════════════════════
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email||!otp) return res.status(400).json({ msg: "Email and code required" });

    const el    = norm(email);
    const entry = await Pending.findOne({ email: el });

    if (!entry || entry.expiresAt < new Date()) {
      if (entry) await Pending.deleteOne({ email: el });
      return res.status(400).json({ msg: "Code expired. Please register again." });
    }

    entry.attempts += 1;
    if (entry.attempts > 5) {
      await Pending.deleteOne({ email: el });
      return res.status(429).json({ msg: "Too many attempts. Register again." });
    }
    await entry.save();

    if (entry.otp !== String(otp).trim())
      return res.status(400).json({ msg: `Incorrect code (${entry.attempts}/5 attempts)` });

    const ud  = entry.data;
    const dup = await User.findOne({ $or:[{ email:ud.email },{ username:ud.username }] });
    if (dup) { await Pending.deleteOne({ email: el }); return res.status(400).json({ msg: "Account already exists. Please login." }); }

    const user = await User.create({
      firstName:ud.firstName, middleName:ud.middleName||"", lastName:ud.lastName,
      username:ud.username, email:ud.email, password:ud.password,
      dob:ud.dob, age:ud.age, isVerified:true, isAdmin:ud.isAdmin||false,
    });
    await Pending.deleteOne({ email: el });

    const token = signJWT(user._id);
    res.json({ msg:"Account created! Welcome 🎉", token, user: userView(user) });
  } catch (e) { console.error("VERIFY ERROR:", e); res.status(500).json({ msg: "Server error: " + e.message }); }
});

// ════════════════════════════════════════════════════════════
// RESEND OTP
// ════════════════════════════════════════════════════════════
router.post("/resend-otp", async (req, res) => {
  try {
    const el    = norm(req.body.email);
    const entry = await Pending.findOne({ email: el });
    if (!entry) return res.status(400).json({ msg: "No pending registration. Please register again." });

    const otp = genOTP();
    entry.otp = otp; entry.attempts = 0; entry.expiresAt = expiry(15 * 60 * 1000);
    await entry.save();

    console.log(` RESEND OTP for ${el}: ${otp}`);
    const sent = await sendEmail(el, "Your new ChatSphere code", otpHtml(entry.data.firstName, otp, "verify"));
    res.json({ msg: sent ? "New code sent!" : `Dev OTP: ${otp}`, devOtp: !sent ? otp : undefined });
  } catch (e) { res.status(500).json({ msg: "Server error: " + e.message }); }
});

// ════════════════════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════════════════════
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email?.trim()||!password) return res.status(400).json({ msg: "Email and password required" });

    const cleaned = norm(email.replace(/^@/, ""));
    const user    = await User.findOne({ $or:[{ email:cleaned },{ username:cleaned }] });

    if (!user)         return res.status(400).json({ msg: "Account not found. Please register." });
    if (user.isBanned) return res.status(403).json({ msg: "Account banned. Contact support." });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ msg: "Incorrect password" });

    if (user.email === ADMIN_EMAIL && !user.isAdmin) {
      user.isAdmin = true; await user.save();
    }

    const token = signJWT(user._id);
    res.json({ token, user: userView(user) });
  } catch (e) { console.error("LOGIN ERROR:", e); res.status(500).json({ msg: "Server error: " + e.message }); }
});

// ════════════════════════════════════════════════════════════
// FORGOT PASSWORD
// ════════════════════════════════════════════════════════════
router.post("/forgot-password", async (req, res) => {
  try {
    const el = norm(req.body.email);
    if (!el) return res.status(400).json({ msg: "Email required" });
    const user = await User.findOne({ email: el });
    if (!user) return res.json({ msg: "If that email is registered, a code has been sent." });

    const otp = genOTP();
    await Reset.findOneAndUpdate(
      { email: el },
      { data: { userId: user._id.toString(), email: user.email },
        otp, attempts: 0, expiresAt: expiry(10 * 60 * 1000) },
      { upsert: true, new: true }
    );
    console.log(` RESET OTP for ${user.email}: ${otp}`);
    await sendEmail(user.email, "Reset your ChatSphere password", otpHtml(user.firstName, otp, "reset"));
    res.json({ msg: "Reset code sent to your email." });
  } catch (e) { res.status(500).json({ msg: "Server error: " + e.message }); }
});

// ════════════════════════════════════════════════════════════
// VERIFY RESET OTP
// ════════════════════════════════════════════════════════════
router.post("/verify-reset-otp", async (req, res) => {
  try {
    const { otp } = req.body;
    const el      = norm(req.body.email);
    const entry   = await Reset.findOne({ email: el });

    if (!entry || entry.expiresAt < new Date()) {
      if (entry) await Reset.deleteOne({ email: el });
      return res.status(400).json({ msg: "Code expired. Request a new one." });
    }

    entry.attempts += 1;
    if (entry.attempts > 5) {
      await Reset.deleteOne({ email: el });
      return res.status(429).json({ msg: "Too many attempts. Request new code." });
    }
    await entry.save();

    if (entry.otp !== String(otp).trim())
      return res.status(400).json({ msg: "Incorrect code" });

    const resetToken = jwt.sign({ userId: entry.data.userId, purpose:"reset" }, JWT_SECRET, { expiresIn:"10m" });
    await Reset.deleteOne({ email: el });
    res.json({ msg: "Code verified", resetToken });
  } catch (e) { res.status(500).json({ msg: "Server error: " + e.message }); }
});

// ════════════════════════════════════════════════════════════
// RESET PASSWORD
// ════════════════════════════════════════════════════════════
router.post("/reset-password", async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken||!newPassword) return res.status(400).json({ msg: "Token and password required" });
    if (newPassword.length < 6) return res.status(400).json({ msg: "Password must be 6+ characters" });
    let payload;
    try { payload = jwt.verify(resetToken, JWT_SECRET); } catch { return res.status(400).json({ msg: "Reset link expired. Start over." }); }
    if (payload.purpose !== "reset") return res.status(400).json({ msg: "Invalid token" });
    const hashed = await bcrypt.hash(newPassword, 12);
    await User.findByIdAndUpdate(payload.userId, { password: hashed });
    res.json({ msg: "Password updated! Please login." });
  } catch (e) { res.status(500).json({ msg: "Server error: " + e.message }); }
});

// ── Save RSA public key ──────────────────────────────────────
router.post("/save-key", require("../middleware/authMiddleware"), async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) return res.status(400).json({ msg: "No key provided" });
    await User.findByIdAndUpdate(req.user.id, { publicKey });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ msg: e.message }); }
});

module.exports = router;