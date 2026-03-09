const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  firstName:       { type: String, required: true, trim: true },
  middleName:      { type: String, trim: true, default: "" },
  lastName:        { type: String, required: true, trim: true },
  username:        { type: String, required: true, unique: true, lowercase: true, trim: true },
  email:           { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:        { type: String, required: true },
  publicKey:       { type: String, default: "" },
  avatar:          { type: String, default: "" },
  bio:             { type: String, default: "", maxlength: 150 },
  dob:             { type: Date },
  age:             { type: Number, default: 0 },
  isVerified:      { type: Boolean, default: false },
  isAdmin:         { type: Boolean, default: false },
  isBanned:        { type: Boolean, default: false },
  isOnline:        { type: Boolean, default: false },
  isPrivate:       { type: Boolean, default: false },
  blockedUsers:    [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  followers:       [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  following:       [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  pendingRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  sentRequests:    [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  otpCode:         { type: String, default: null },
  otpExpires:      { type: Date, default: null },
  lastSeen:        { type: Date, default: Date.now },
  createdAt:       { type: Date, default: Date.now },
  displayName:     { type: String, default: "" },
});

// FIX: use async pre-save — no next() needed, works on all Mongoose versions
UserSchema.pre("save", async function() {
  this.displayName = [this.firstName, this.lastName].filter(Boolean).join(" ");
});

// DSA: indexes for fast lookups
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ displayName: 1 });

module.exports = mongoose.model("User", UserSchema);