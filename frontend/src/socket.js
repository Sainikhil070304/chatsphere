import { io } from "socket.io-client";

const BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Singleton socket — created once, never recreated on re-render
export const socket = io(BASE, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ["websocket"], // skip polling — much faster
});

// Global message bus — ChatWindow subscribes to this
export const messageListeners = new Set();
export const messageBuffer = [];

socket.on("connect", () => {
  console.log("✅ Socket connected:", socket.id);
  const me = JSON.parse(localStorage.getItem("me") || "null");
  if (me) {
    socket.emit("online", me._id);
    socket.emit("getOnline");
  }
});

socket.on("receive", (m) => {
  if (messageListeners.size > 0) {
    messageListeners.forEach(fn => fn(m));
  } else {
    messageBuffer.push(m);
  }
});

socket.on("disconnect", (reason) => {
  console.log("❌ Disconnected:", reason);
});

socket.on("rateLimited", (data) => {
  console.warn("🚫 Rate limited:", data.msg);
});