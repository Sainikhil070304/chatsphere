const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  firstName:    { type: String, required: true, trim: true },
  middleName:   { type: String, trim: true, default: "" },
  lastName:     { type: String, required: true, trim: true },
  username:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  email:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:     { type: String, required: true },
  publicKey:    { type: String, default: "" },
  avatar:       { type: String, default: "" },
  bio:          { type: String, default: "", maxlength: 150 },
  dob:          { type: Date },           // ← not required: existing users may not have it
  age:          { type: Number, default: 0 },
  isVerified:   { type: Boolean, default: false },
  isAdmin:      { type: Boolean, default: false },
  isBanned:     { type: Boolean, default: false },
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  followers:    [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  following:    [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  otpCode:      { type: String, default: null },
  otpExpires:   { type: Date, default: null },
  lastSeen:     { type: Date, default: Date.now },
  createdAt:    { type: Date, default: Date.now },
  // Computed display name for Trie search
  displayName:  { type: String, default: "" },
});

// Keep displayName in sync automatically
UserSchema.pre("save", function(next) {
  this.displayName = [this.firstName, this.lastName].filter(Boolean).join(" ");
  next();
});

module.exports = mongoose.model("User", UserSchema);
