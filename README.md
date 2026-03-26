# 💬 ChatSphere

> **Encrypted. Private. Real-time.**

A full-stack real-time chat application with end-to-end encryption, voice/video calls, group chats, social features, and more — built with the MERN stack and Socket.IO.

🌐 **Live:** [chatsphere-omega.vercel.app](https://chatsphere-omega.vercel.app)

---

## 📸 Features

### 💬 Messaging
- Real-time 1-on-1 and group messaging via Socket.IO
- **End-to-End Encryption (E2E)** — all messages encrypted with AES using CryptoJS
- Voice messages (hold-to-record)
- Image & file sharing
- Message unsend (for everyone)
- Message seen/delivered receipts (✓✓)
- Typing indicators — shows who is typing in real time
- WhatsApp-style clear chat (only clears for you)

### 👥 Groups
- Create groups with custom name and photo
- Group admin controls — add/remove members
- Group E2E encryption
- Real-time typing indicators in groups
- Group voice & video calls

### 📞 Calls
- 1-on-1 voice calls (WebRTC)
- 1-on-1 video calls (WebRTC)
- Group calls
- Incoming call banner with accept/reject

### 🔐 Auth & Security
- Register with email OTP verification (Resend)
- Login with email or @username
- JWT authentication (7-day tokens)
- Forgot password / reset via OTP
- Password hashing with bcryptjs (12 rounds)
- Rate limiting on messages and search

### 🌐 Social (Instagram-style)
- **Ping** = Follow / Send follow request
- **Unping** = Unfollow
- Private accounts — require approval before following
- Accept / Decline follow requests
- Block / Unblock users
- Posts visible only to followers
- Notifications for pings, requests, and messages

### 👤 Profile
- Avatar upload
- Bio (150 chars)
- Edit name, username
- View other user profiles

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Socket.IO Client |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas + Mongoose |
| Real-time | Socket.IO |
| Auth | JWT + bcryptjs |
| Encryption | CryptoJS (AES E2E) |
| Email | Resend |
| File uploads | Multer |
| Calls | WebRTC |
| Deployment | Vercel (frontend) + Render (backend) |

---

## ⚡ DSA & Performance

ChatSphere uses real Data Structures & Algorithms for maximum performance:

| DSA | Usage |
|-----|-------|
| **HashMap** O(1) | `userId → socketId` online map, socket reverse lookup, DM dedup |
| **LRU Cache** | Message caching — invalidated on send/unsend/clear |
| **Trie** | User search — O(log n) prefix search, rebuilt on server start |
| **FIFO Queue** | Offline message delivery — flushed on reconnect |
| **Token Bucket** | Rate limiting — messages and search per user |
| **Debounce HashMap** | Typing indicators — 800ms debounce per user pair |
| **Multi-tab Set** | Each user has a `Set<socketId>` — supports multiple browser tabs |

---

## 📁 Project Structure

```
chat-app/
├── backend/
│   ├── config/
│   │   └── db.js               # MongoDB connection
│   ├── dsa/
│   │   ├── LRUCache.js         # Message cache
│   │   ├── MessageQueue.js     # Offline message queue
│   │   ├── RateLimiter.js      # Token bucket rate limiter
│   │   └── TrieSearch.js       # User search trie
│   ├── middleware/
│   │   └── authMiddleware.js   # JWT verification
│   ├── models/
│   │   ├── Chat.js
│   │   ├── ConnectionRequest.js
│   │   ├── Group.js
│   │   ├── Message.js
│   │   ├── Post.js
│   │   └── User.js
│   ├── routes/
│   │   ├── admin.js
│   │   ├── auth.js             # Register, login, OTP, reset
│   │   ├── chat.js             # DMs, clear chat, file upload
│   │   ├── connections.js
│   │   ├── group.js            # Groups, members, avatar
│   │   ├── posts.js
│   │   ├── profile.js
│   │   └── user.js             # Ping, unping, block, follow
│   ├── utils/
│   │   └── encryption.js       # AES encrypt/decrypt helpers
│   └── server.js               # Express + Socket.IO server
│
└── frontend/
    ├── public/
    └── src/
        ├── components/
        │   ├── AdminPanel.jsx
        │   ├── Call.jsx
        │   ├── ChatList.jsx     # Sidebar — DMs, groups, users
        │   ├── ChatWindow.jsx   # Message view, voice, calls
        │   ├── Feed.jsx         # Posts feed
        │   ├── Login.jsx
        │   ├── Notifications.jsx
        │   ├── Profile.jsx
        │   ├── Register.jsx
        │   ├── UserProfile.jsx
        │   └── VideoCall.jsx
        ├── services/
        │   └── api.js           # Axios instance
        ├── App.jsx
        ├── crypto.js            # CryptoJS E2E helpers
        ├── main.jsx
        ├── socket.js            # Socket.IO client
        └── style.css
```

---

## 🚀 Local Development

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### 1. Clone the repo
```bash
git clone https://github.com/Sainikhil070304/chatsphere.git
cd chatsphere
```

### 2. Backend setup
```bash
cd backend
npm install
```

Create `backend/.env`

Start backend:
```bash
node server.js
```

### 3. Frontend setup
```bash
cd frontend
npm install
```

Create `frontend/.env`

Start frontend:
```bash
npm run dev
```

Open [http://localhost:](http://localhost:)

---

## ☁️ Deployment

### Backend → Render
1. Connect GitHub repo to Render
2. Set **Root Directory** to `backend`
3. Set **Start Command** to `node server.js`
4. Add environment variables:
   - `MONGO_URI`
   - `JWT_SECRET`
   - `CHAT_SECRET`
   - `RESEND_API_KEY`
   - `NODE_ENV=production`

### Frontend → Vercel
1. Connect GitHub repo to Vercel
2. Set **Root Directory** to `frontend`
3. Add environment variables

## 🔒 Encryption

All messages are encrypted **before** being sent to the server:

```
Sender → AES encrypt(message, CHAT_SECRET) → Server → Receiver → AES decrypt
```

- Server **never** sees plaintext messages
- Group messages use the same shared secret
- Audio/image messages are stored encrypted

---

## 📡 Socket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `online` | client→server | User comes online |
| `send` | client→server | Send a message |
| `receive` | server→client | Receive a message |
| `typing` | client→server | User is typing |
| `stopTyping` | client→server | User stopped typing |
| `seen` | client→server | Message seen |
| `unsend` | client→server | Unsend a message |
| `call:offer` | client→server | Initiate a call |
| `call:incoming` | server→client | Notify callee |
| `call:answer` | client→server | Accept call |
| `call:end` | client→server | End call |

---

## 🗺️ Roadmap

- [x] Real-time messaging with E2E encryption
- [x] Group chats with admin controls
- [x] Voice & video calls (WebRTC)
- [x] Voice messages
- [x] OTP email verification
- [x] Social features (ping/unping/block/follow)
- [x] Group photo upload
- [x] Typing indicators
- [x] Message seen/delivered
- [x] Clear chat
- [x] Deploy to Vercel + Render
- [ ] Push notifications
- [ ] Message reactions
- [ ] Stories
- [ ] Admin dashboard

---

## 👨‍💻 Author

**Sai Nikhil Nallela**
- GitHub: [@Sainikhil070304](https://github.com/Sainikhil070304)

---

