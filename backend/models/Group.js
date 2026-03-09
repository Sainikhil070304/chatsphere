const mongoose = require("mongoose");
const GroupSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true, maxlength: 60 },
  avatar:      { type: String, default: "" },          // group photo URL
  admin:       { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  members:     [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  lastMessage: { type: String, default: "" },
  // Group E2E: each member gets the group AES key encrypted with their RSA public key
  encryptedKeys: {
    type: Map,
    of: String,   // userId → AES key encrypted with that user's RSA public key
    default: {},
  },
}, { timestamps: true });
module.exports = mongoose.model("Group", GroupSchema);
