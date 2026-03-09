// ============================================================
// DSA #2 — QUEUE (with Map index for O(1) enqueue/dequeue)
// Used for: Offline message delivery
// When a user is offline, messages are queued.
// When they come online, all queued messages are delivered.
// ============================================================

class MessageQueue {
  constructor() {
    // Map<userId, Array<message>> — one queue per user
    this.queues = new Map();
    this.MAX_QUEUE_SIZE = 100; // max messages stored per offline user
  }

  // Enqueue message for an offline user — O(1)
  enqueue(toUserId, message) {
    const uid = toUserId.toString();
    if (!this.queues.has(uid)) {
      this.queues.set(uid, []);
    }
    const q = this.queues.get(uid);
    if (q.length >= this.MAX_QUEUE_SIZE) {
      q.shift(); // drop oldest if queue is full (like circular buffer)
    }
    q.push({
      ...message,
      queuedAt: new Date(),
    });
    console.log(`📦 Queued message for offline user ${uid}, queue size: ${q.length}`);
  }

  // Dequeue all messages for a user when they come online — O(n)
  flush(userId) {
    const uid = userId.toString();
    if (!this.queues.has(uid)) return [];
    const messages = this.queues.get(uid);
    this.queues.delete(uid); // clear queue after flush
    console.log(`📬 Flushed ${messages.length} queued messages for user ${uid}`);
    return messages;
  }

  // Check if user has queued messages — O(1)
  hasMessages(userId) {
    const uid = userId.toString();
    return this.queues.has(uid) && this.queues.get(uid).length > 0;
  }

  // Get queue size — O(1)
  size(userId) {
    const uid = userId.toString();
    return this.queues.has(uid) ? this.queues.get(uid).length : 0;
  }

  // Clear queue for a user (on ban/delete) — O(1)
  clear(userId) {
    this.queues.delete(userId.toString());
  }
}

const messageQueue = new MessageQueue();
module.exports = { messageQueue };
