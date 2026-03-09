require("dotenv").config();
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const User   = require("../models/User");

// ── Safe Resend import ──
let ResendClient = null;
try { const m = require("resend"); ResendClient = m.Resend || m.default?.Resend || null; } catch(e) { console.log("Resend not installed:", e.message); }

const RESEND_KEY = "re_XJZB8h2j_LYRXecZ8wuGkFBh1JJBbFf1Q";
const JWT_SECRET = process.env.JWT_SECRET || "chatsphere_jwt_secret_2024";

// ════════════════════════════════════════════════════════════
// OOP: TTLStore  (DSA: HashMap + expiry cleanup)
// ════════════════════════════════════════════════════════════
class TTLStore {
  constructor(ttlMs = 15 * 60 * 1000) {
    this.map   = new Map();
    this.ttlMs = ttlMs;
    setInterval(() => this._cleanup(), 5 * 60 * 1000);
  }
  _key(k)  { return String(k).toLowerCase().trim(); }
  set(k, v){ this.map.set(this._key(k), { v, otp: null, attempts: 0, exp: Date.now() + this.ttlMs }); }
  get(k)   { const e = this.map.get(this._key(k)); if (!e || Date.now() > e.exp) { this.map.delete(this._key(k)); return null; } return e; }
  del(k)   { this.map.delete(this._key(k)); }
  setOtp(k, otp) { const e = this.get(k); if (e) { e.otp = otp; e.exp = Date.now() + this.ttlMs; e.attempts = 0; } }
  checkOtp(k, otp) {
    const e = this.get(k); if (!e) return { ok: false, reason: "expired" };
    e.attempts++;
    if (e.attempts > 5) { this.del(k); return { ok: false, reason: "toomany" }; }
    if (e.otp !== String(otp).trim()) return { ok: false, reason: `wrong:${e.attempts}` };
    return { ok: true, data: e.v };
  }
  _cleanup() { const now = Date.now(); for (const [k,v] of this.map) if (now > v.exp) this.map.delete(k); }
}

const pendingStore = new TTLStore(15 * 60 * 1000);
const resetStore   = new TTLStore(10 * 60 * 1000);

// ════════════════════════════════════════════════════════════
// OOP: EmailService  (wraps Resend)
// ════════════════════════════════════════════════════════════
class EmailService {
  constructor(apiKey) {
    this.key    = apiKey;
    this.client = ResendClient ? new ResendClient(apiKey) : null;
    this.from   = "ChatSphere <onboarding@resend.dev>";
  }
  async send(to, subject, html) {
    console.log(`\
 EMAIL → ${to}\
 OTP in HTML (check log above)\
`);
    if (!this.client) { console.warn("⚠  resend not installed. Run: npm install resend"); return false; }
    try {
      const r = await this.client.emails.send({ from: this.from, to, subject, html });
      console.log("✅ Resend result:", JSON.stringify(r?.data || r));
      return true;
    } catch (e) { console.error("❌ Resend error:", e?.message || e); return false; }
  }

  otpHtml(name, otp, type = "verify") {
    const accent = type === "reset" ? "#f87171" : "#a78bfa";
    const icon   = type === "reset" ? "" : "";
    const title  = type === "reset" ? `Reset your password, ${name}` : `Verify your email, ${name}`;
    const sub    = type === "reset" ? "Use this code to reset your password. Expires in 10 min." : "Enter this code in the app. Expires in 15 min.";
    return `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;background:#0a0d16;color:#fff;padding:40px;border-radius:20px;border:1px solid rgba(255,255,255,0.07)">
      <div style="text-align:center;margin-bottom:28px"><div style="font-size:36px">${icon}</div><h1 style="color:${accent};font-size:26px;margin:8px 0 0;font-weight:900">ChatSphere</h1></div>
      <h2 style="font-size:18px;margin:0 0 8px">${title}</h2>
      <p style="color:#8b8ba0;margin:0 0 24px;font-size:14px;line-height:1.5">${sub}</p>
      <div style="background:rgba(255,255,255,0.04);border:1px solid ${accent}44;border-radius:14px;padding:28px;text-align:center;margin-bottom:24px">
        <div style="font-size:44px;letter-spacing:14px;font-weight:900;color:${accent};font-family:monospace">${otp}</div>
      </div>
      <p style="color:#4b4b60;font-size:12px;margin:0">If you didn't request this, ignore this email.</p>
    </div>`;
  }
}
const mailer = new EmailService(RESEND_KEY);

// ════════════════════════════════════════════════════════════
// Helpers
// ════════════════════════════════════════════════════════════
const genOTP   = () => String(Math.floor(100000 + Math.random() * 900000));
const signJWT  = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: "7d" });
const userView = u => ({ _id:u._id, firstName:u.firstName, lastName:u.lastName, username:u.username, email:u.email, isAdmin:u.isAdmin, avatar:u.avatar, bio:u.bio, publicKey:u.publicKey });

// ════════════════════════════════════════════════════════════
// REGISTER  (Step 1 — store pending, send OTP)
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

    const el = email.toLowerCase().trim();
    const ul = username.toLowerCase().trim();

    if (!/^[a-z0-9_]+$/.test(ul))
      return res.status(400).json({ msg: "Username: only letters, numbers, underscore" });

    const dup = await User.findOne({ $or:[{ email:el },{ username:ul }] });
    if (dup?.email === el)       return res.status(400).json({ msg: "Email already registered. Please login." });
    if (dup?.username === ul)    return res.status(400).json({ msg: "Username already taken" });

    const hashed = await bcrypt.hash(password, 12);
    const otp    = genOTP();

    pendingStore.set(el, { firstName, middleName, lastName, username:ul, email:el, password:hashed, dob, age });
    pendingStore.setOtp(el, otp);

    console.log(` REGISTER OTP for ${el}: ${otp}`);
    const sent = await mailer.send(el, "Your ChatSphere verification code", mailer.otpHtml(firstName, otp, "verify"));

    res.json({
      msg:   sent ? "Verification code sent! Check your email." : `Dev mode — OTP: ${otp}`,
      step:  "verify",
      email: el,
      devOtp: process.env.NODE_ENV !== "production" ? otp : undefined,
    });
  } catch (e) { console.error("REGISTER ERROR:", e); res.status(500).json({ msg: "Server error: " + e.message }); }
});

// ════════════════════════════════════════════════════════════
// VERIFY OTP  (Step 2 — create user in DB)
// ════════════════════════════════════════════════════════════
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email||!otp) return res.status(400).json({ msg: "Email and code required" });

    const result = pendingStore.checkOtp(email, otp);
    if (!result.ok) {
      if (result.reason === "expired")  return res.status(400).json({ msg: "Code expired. Please register again." });
      if (result.reason === "toomany")  return res.status(429).json({ msg: "Too many attempts. Register again." });
      const attempt = result.reason.split(":")[1];
      return res.status(400).json({ msg: `Incorrect code (${attempt}/5 attempts)` });
    }

    const ud = result.data;
    const dup = await User.findOne({ $or:[{ email:ud.email },{ username:ud.username }] });
    if (dup) { pendingStore.del(email); return res.status(400).json({ msg: "Account already exists. Please login." }); }

    const user = await User.create({
      firstName:ud.firstName, middleName:ud.middleName||"", lastName:ud.lastName,
      username:ud.username, email:ud.email, password:ud.password,
      dob:ud.dob, age:ud.age, isVerified:true,
    });
    pendingStore.del(email);

    const token = signJWT(user._id);
    res.json({ msg:"Account created! Welcome ", token, user: userView(user) });
  } catch (e) { console.error("VERIFY ERROR:", e); res.status(500).json({ msg: "Server error: " + e.message }); }
});

// ════════════════════════════════════════════════════════════
// RESEND OTP
// ════════════════════════════════════════════════════════════
router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;
    const entry = pendingStore.get(email);
    if (!entry) return res.status(400).json({ msg: "No pending registration. Please register again." });

    const otp = genOTP();
    pendingStore.setOtp(email, otp);
    console.log(` RESEND OTP for ${email}: ${otp}`);
    const sent = await mailer.send(email, "Your new ChatSphere code", mailer.otpHtml(entry.v.firstName, otp, "verify"));
    res.json({ msg: sent ? "New code sent!" : `Dev OTP: ${otp}`, devOtp: process.env.NODE_ENV !== "production" ? otp : undefined });
  } catch (e) { res.status(500).json({ msg: "Server error: " + e.message }); }
});

// ════════════════════════════════════════════════════════════
// LOGIN  (by email OR @username, no @ prefix needed)
// ════════════════════════════════════════════════════════════
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email?.trim()||!password) return res.status(400).json({ msg: "Email and password required" });

    const cleaned = email.trim().replace(/^@/,"").toLowerCase();
    // Support: email OR username
    const user = await User.findOne({ $or:[{ email:cleaned },{ username:cleaned }] });

    if (!user)        return res.status(400).json({ msg: "Account not found. Please register." });
    if (user.isBanned) return res.status(403).json({ msg: "Account banned. Contact support." });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ msg: "Incorrect password" });

    const token = signJWT(user._id);
    res.json({ token, user: userView(user) });
  } catch (e) { console.error("LOGIN ERROR:", e); res.status(500).json({ msg: "Server error: " + e.message }); }
});

// ════════════════════════════════════════════════════════════
// FORGOT PASSWORD — send reset OTP
// ════════════════════════════════════════════════════════════
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email?.trim()) return res.status(400).json({ msg: "Email required" });
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    // always 200 (prevent email enumeration)
    if (!user) return res.json({ msg: "If that email is registered, a code has been sent." });

    const otp = genOTP();
    resetStore.set(email.toLowerCase(), { userId: user._id.toString(), email: user.email });
    resetStore.setOtp(email.toLowerCase(), otp);

    console.log(` RESET OTP for ${user.email}: ${otp}`);
    await mailer.send(user.email, "Reset your ChatSphere password", mailer.otpHtml(user.firstName, otp, "reset"));
    res.json({ msg: "Reset code sent to your email." });
  } catch (e) { res.status(500).json({ msg: "Server error: " + e.message }); }
});

// ════════════════════════════════════════════════════════════
// VERIFY RESET OTP
// ════════════════════════════════════════════════════════════
router.post("/verify-reset-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const result = resetStore.checkOtp(email, otp);
    if (!result.ok) {
      if (result.reason === "expired") return res.status(400).json({ msg: "Code expired. Request a new one." });
      if (result.reason === "toomany") return res.status(429).json({ msg: "Too many attempts. Request new code." });
      return res.status(400).json({ msg: "Incorrect code" });
    }
    const resetToken = jwt.sign({ userId: result.data.userId, purpose:"reset" }, JWT_SECRET, { expiresIn:"10m" });
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

// ── Save RSA public key after key generation ─────────────────
router.post("/save-key", require("../middleware/authMiddleware"), async (req, res) => {
  try {
    const { publicKey } = req.body;
    if (!publicKey) return res.status(400).json({ msg: "No key provided" });
    await User.findByIdAndUpdate(req.user.id, { publicKey });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ msg: e.message }); }
});

module.exports = router;
