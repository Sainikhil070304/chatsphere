const mongoose = require("mongoose");
const CommentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, required: true, trim: true, maxlength: 500 },
  createdAt: { type: Date, default: Date.now },
});
const PostSchema = new mongoose.Schema({
  author:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  caption:  { type: String, trim: true, maxlength: 1000, default: "" },
  media:    [{ url: String, type: { type: String, enum: ["image","video","file"], default: "image" } }],
  likes:    [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  comments: [CommentSchema],
  shares:   { type: Number, default: 0 },
}, { timestamps: true });
module.exports = mongoose.model("Post", PostSchema);
