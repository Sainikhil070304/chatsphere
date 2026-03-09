const mongoose = require("mongoose");

const ChatSchema = new mongoose.Schema({
  members:     [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  lastMessage: { type: String, default: "" },
  updatedAt:   { type: Date, default: Date.now },
  // WhatsApp-style: stores per-user clear timestamp
  // e.g. { "userId1": Date, "userId2": null }
  clearedAt:   { type: Map, of: Date, default: {} },
});

ChatSchema.index({ members: 1 });

module.exports = mongoose.model("Chat", ChatSchema);