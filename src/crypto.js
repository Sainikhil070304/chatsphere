import CryptoJS from "crypto-js";

// Must match VITE_CHAT_SECRET in your frontend .env
const SECRET = import.meta.env.VITE_CHAT_SECRET || "chatsphere_e2e_secret_2024";

/**
 * Encrypt plaintext — returns encrypted string
 */
export function encryptMsg(text) {
  if (!text) return text;
  try {
    return CryptoJS.AES.encrypt(String(text), SECRET).toString();
  } catch (e) {
    console.warn("[crypto] encrypt failed:", e);
    return text;
  }
}

/**
 * Decrypt encrypted string — returns plaintext
 * Falls back to showing raw text if decryption fails (no crashes)
 */
export function decryptMsg(cipher) {
  if (!cipher) return "";
  try {
    const bytes   = CryptoJS.AES.decrypt(cipher, SECRET);
    const decoded = bytes.toString(CryptoJS.enc.Utf8);
    if (!decoded || decoded.length === 0) return cipher;
    return decoded;
  } catch (e) {
    return cipher; // Show raw rather than crash
  }
}

/**
 * Detect if a string is CryptoJS AES encrypted output
 * CryptoJS always prefixes output with "U2Fs" (base64 of "Sal")
 */
export function isEncrypted(text) {
  if (!text || typeof text !== "string") return false;
  return text.startsWith("U2Fs") && text.length > 20;
}

/**
 * Safe decrypt — only decrypts if text looks encrypted, else returns as-is
 * Use this everywhere you display message content
 */
export function safeDecrypt(text) {
  if (!text) return "";
  if (isEncrypted(text)) return decryptMsg(text);
  return text;
}
