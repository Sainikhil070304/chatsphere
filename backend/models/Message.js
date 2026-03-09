const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  chatId:    { type: mongoose.Schema.Types.ObjectId, ref: "Chat" },
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  encrypted: { type: String, default: "" },
  type:      { type: String, default: "text" },   // text | image | audio | file
  status:    { type: String, default: "sent" },   // sent | delivered | seen
  unsent:    { type: Boolean, default: false },
  fileUrl:   { type: String, default: "" },
  fileName:  { type: String, default: "" },
  fileSize:  { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

MessageSchema.index({ chatId: 1, createdAt: 1 });

module.exports = mongoose.model("Message", MessageSchema);