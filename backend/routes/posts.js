// ════════════════════════════════════════════════════════════════
// posts.js — Follow/Unping system + post visibility
// OOP: SocialGraph class | DSA: Set for O(1) relationship checks
// Unping = block: deletes all messages between users
// ════════════════════════════════════════════════════════════════
const router  = require("express").Router();
const Post    = require("../models/Post");
const User    = require("../models/User");
const Chat    = require("../models/Chat");
const Message = require("../models/Message");
const auth    = require("../middleware/authMiddleware");
const multer  = require("multer");
const path    = require("path");
const fs      = require("fs");
const { messageCache } = require("../dsa/LRUCache");

// ── OOP: SocialGraph manages follow/block relationships ──────────
class SocialGraph {
  // DSA: O(1) check using Set
  static async getRelationship(meId, targetId) {
    const [me, target] = await Promise.all([
      User.findById(meId).select("following blockedUsers"),
      User.findById(targetId).select("following blockedUsers"),
    ]);
    const myFollowing    = new Set((me?.following||[]).map(String));
    const myBlocked      = new Set((me?.blockedUsers||[]).map(String));
    const theyFollow     = new Set((target?.following||[]).map(String));
    const theyBlocked    = new Set((target?.blockedUsers||[]).map(String));
    const t = String(targetId), m = String(meId);
    return {
      following:     myFollowing.has(t),
      blocked:       myBlocked.has(t),
      blockedByThem: theyBlocked.has(m),
      mutualFollow:  myFollowing.has(t) && theyFollow.has(m),
    };
  }

  // Join (follow) — one-way is enough to see posts, mutual needed for chat
  static async follow(meId, targetId) {
    await Promise.all([
      User.findByIdAndUpdate(meId,     { $addToSet:{ following:targetId } }),
      User.findByIdAndUpdate(targetId, { $addToSet:{ followers:meId } }),
    ]);
  }

  // Unping = unfollow + block + delete all messages both ways
  static async unping(meId, targetId) {
    // Remove follow both ways
    await Promise.all([
      User.findByIdAndUpdate(meId,     { $pull:{ following:targetId, followers:targetId }, $addToSet:{ blockedUsers:targetId } }),
      User.findByIdAndUpdate(targetId, { $pull:{ following:meId,     followers:meId     } }),
    ]);
    // Delete all chat messages between them
    const chat = await Chat.findOne({ members:{ $all:[meId, targetId] } });
    if (chat) {
      await Message.deleteMany({ chatId:chat._id });
      await Chat.findByIdAndDelete(chat._id);
      messageCache.invalidate(String(chat._id));
    }
  }

  // Remove block (allow re-joining)
  static async removeBlock(meId, targetId) {
    await User.findByIdAndUpdate(meId, { $pull:{ blockedUsers:targetId } });
  }
}

// ── File upload ──────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req,f,cb) => { const d=path.join(__dirname,"../uploads/posts"); if(!fs.existsSync(d))fs.mkdirSync(d,{recursive:true}); cb(null,d); },
  filename:    (req,f,cb) => cb(null,`${Date.now()}-${f.originalname.replace(/[^a-zA-Z0-9._-]/g,"_")}`),
});
const upload = multer({ storage, limits:{ fileSize:50*1024*1024 } });

// ── FEED: posts from people I joined ────────────────────────────
router.get("/feed", auth, async (req, res) => {
  try {
    const me      = await User.findById(req.user.id).select("following blockedUsers");
    const blocked = new Set((me.blockedUsers||[]).map(String));
    const authors = [(me.following||[]).map(String).filter(id => !blocked.has(id)), req.user.id].flat();
    const posts   = await Post.find({ author:{ $in:authors } })
      .populate("author",        "firstName lastName username avatar")
      .populate("comments.user", "firstName lastName username avatar")
      .sort({ createdAt:-1 }).limit(50);
    res.json(posts);
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// ── User's posts (only if I've joined them) ──────────────────────
router.get("/user/:username", auth, async (req, res) => {
  try {
    const target = await User.findOne({ username:req.params.username });
    if (!target) return res.status(404).json({ msg:"User not found" });
    const rel = await SocialGraph.getRelationship(req.user.id, String(target._id));
    const canView = String(target._id)===req.user.id || rel.following;
    if (!canView) return res.json([]);
    const posts = await Post.find({ author:target._id })
      .populate("author",        "firstName lastName username avatar")
      .populate("comments.user", "firstName lastName username avatar")
      .sort({ createdAt:-1 });
    res.json(posts);
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// ── CREATE post ──────────────────────────────────────────────────
router.post("/", auth, upload.array("media",5), async (req, res) => {
  try {
    const { caption } = req.body;
    if (!caption?.trim()&&(!req.files||!req.files.length)) return res.status(400).json({ msg:"Post needs caption or media" });
    const media = (req.files||[]).map(f => ({ url:`/uploads/posts/${f.filename}`, type:f.mimetype.startsWith("video/")?"video":"image" }));
    const post  = await Post.create({ author:req.user.id, caption:caption?.trim()||"", media });
    const pop   = await Post.findById(post._id).populate("author","firstName lastName username avatar");
    res.status(201).json(pop);
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// ── DELETE post ──────────────────────────────────────────────────
router.delete("/:postId", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ msg:"Not found" });
    if (String(post.author)!==req.user.id) return res.status(403).json({ msg:"Not your post" });
    await Post.findByIdAndDelete(req.params.postId);
    res.json({ msg:"Deleted" });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// ── LIKE / UNLIKE ────────────────────────────────────────────────
router.post("/:postId/like", auth, async (req, res) => {
  try {
    const post  = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ msg:"Not found" });
    const liked = post.likes.map(String).includes(req.user.id);
    if (liked) post.likes = post.likes.filter(l => String(l)!==req.user.id);
    else post.likes.push(req.user.id);
    await post.save();
    res.json({ likes:post.likes.length, liked:!liked });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// ── ADD comment ──────────────────────────────────────────────────
router.post("/:postId/comment", auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ msg:"Empty comment" });
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ msg:"Not found" });
    post.comments.push({ user:req.user.id, text:text.trim() });
    await post.save();
    const updated = await Post.findById(req.params.postId).populate("comments.user","firstName lastName username avatar");
    res.json(updated.comments[updated.comments.length-1]);
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// ── DELETE comment ───────────────────────────────────────────────
router.delete("/:postId/comment/:commentId", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ msg:"Not found" });
    const c = post.comments.id(req.params.commentId);
    if (!c) return res.status(404).json({ msg:"Comment not found" });
    if (String(c.user)!==req.user.id&&String(post.author)!==req.user.id) return res.status(403).json({ msg:"Not allowed" });
    post.comments = post.comments.filter(x => String(x._id)!==req.params.commentId);
    await post.save();
    res.json({ msg:"Deleted" });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// ── JOIN (follow) ────────────────────────────────────────────────
router.post("/follow/:userId", auth, async (req, res) => {
  try {
    if (req.params.userId===req.user.id) return res.status(400).json({ msg:"Can't join yourself" });
    const rel = await SocialGraph.getRelationship(req.user.id, req.params.userId);
    if (rel.following) {
      // Unfollow only (not block — use /block for that)
      await User.findByIdAndUpdate(req.user.id,       { $pull:{ following:req.params.userId } });
      await User.findByIdAndUpdate(req.params.userId, { $pull:{ followers:req.user.id } });
      return res.json({ following:false });
    }
    if (rel.blocked) return res.status(403).json({ msg:"You have unpinged this user. Remove unping first." });
    await SocialGraph.follow(req.user.id, req.params.userId);
    res.json({ following:true });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// ── UNPING (block + delete messages + unfollow) ──────────────────
router.post("/unping/:userId", auth, async (req, res) => {
  try {
    await SocialGraph.unping(req.user.id, req.params.userId);
    res.json({ blocked:true, msg:"User unpinged. All messages deleted." });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// ── REMOVE UNPING (unblock, allows re-joining) ───────────────────
router.post("/remove-unping/:userId", auth, async (req, res) => {
  try {
    await SocialGraph.removeBlock(req.user.id, req.params.userId);
    res.json({ blocked:false, msg:"Unping removed. You can now join them again." });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

// ── RELATIONSHIP STATUS ───────────────────────────────────────────
router.get("/follow-status/:userId", auth, async (req, res) => {
  try {
    const rel    = await SocialGraph.getRelationship(req.user.id, req.params.userId);
    const target = await User.findById(req.params.userId).select("followers following");
    res.json({
      following:       rel.following,
      blocked:         rel.blocked,
      blockedByThem:   rel.blockedByThem,
      mutualFollow:    rel.mutualFollow,
      followers_count: target?.followers?.length||0,
      following_count: target?.following?.length||0,
    });
  } catch (e) { res.status(500).json({ error:e.message }); }
});

module.exports = router;
