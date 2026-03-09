const CryptoJS = require("crypto-js");

const SECRET = process.env.CHAT_SECRET || "super_secret_key";

exports.encrypt = (text) => {
  return CryptoJS.AES.encrypt(text, SECRET).toString();
};

exports.decrypt = (cipher) => {
  const bytes = CryptoJS.AES.decrypt(cipher, SECRET);
  return bytes.toString(CryptoJS.enc.Utf8);
};
