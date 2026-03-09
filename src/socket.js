import { io } from "socket.io-client";

export const socket = io("http://localhost:5000", {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  transports: ["websocket"],
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
    console.log("📡 online emitted:", me._id);
  }
});

socket.on("receive", (m) => {
  console.log("🔥 RECEIVE:", m);
  if (messageListeners.size > 0) {
    messageListeners.forEach(fn => fn(m));
  } else {
    messageBuffer.push(m);
    console.log("📦 buffered, size:", messageBuffer.length);
  }
});

socket.on("disconnect", (reason) => {
  console.log("❌ Disconnected:", reason);
});

socket.on("rateLimited", (data) => {
  console.warn("🚫 Rate limited:", data.msg);
});
