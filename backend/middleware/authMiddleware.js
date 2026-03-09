const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "chatsphere_jwt_secret_2024";

module.exports = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ msg: "No token" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ msg: "Invalid token" });
  }
};