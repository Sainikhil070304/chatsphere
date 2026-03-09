// ============================================================
// DSA #3 — LRU CACHE (Doubly Linked List + HashMap)
// Used for: Caching recent chat messages
// Avoids hitting MongoDB for chats users already viewed recently
// Time: O(1) get and put
// ============================================================

class LRUNode {
  constructor(key, value) {
    this.key = key;
    this.value = value;
    this.prev = null;
    this.next = null;
  }
}

class LRUCache {
  constructor(capacity = 50) {
    this.capacity = capacity;       // max chats cached
    this.cache = new Map();         // key -> node
    // Dummy head and tail for easy insertion/removal
    this.head = new LRUNode(null, null); // most recent
    this.tail = new LRUNode(null, null); // least recent
    this.head.next = this.tail;
    this.tail.prev = this.head;
    this.hits = 0;
    this.misses = 0;
  }

  // O(1) get — moves node to front (most recently used)
  get(key) {
    if (!this.cache.has(key)) {
      this.misses++;
      return null;
    }
    const node = this.cache.get(key);
    this._remove(node);
    this._insertFront(node);
    this.hits++;
    return node.value;
  }

  // O(1) put — evicts LRU if over capacity
  put(key, value) {
    if (this.cache.has(key)) {
      this._remove(this.cache.get(key));
    }
    const node = new LRUNode(key, value);
    this._insertFront(node);
    this.cache.set(key, node);

    if (this.cache.size > this.capacity) {
      // Evict least recently used (node before tail)
      const lru = this.tail.prev;
      this._remove(lru);
      this.cache.delete(lru.key);
      console.log(`🗑️ LRU evicted: ${lru.key}`);
    }
  }

  // Invalidate cache for a chat (when new message arrives)
  invalidate(chatId) {
    if (this.cache.has(chatId)) {
      this._remove(this.cache.get(chatId));
      this.cache.delete(chatId);
    }
  }

  _remove(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  _insertFront(node) {
    node.next = this.head.next;
    node.prev = this.head;
    this.head.next.prev = node;
    this.head.next = node;
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      capacity: this.capacity,
      hits: this.hits,
      misses: this.misses,
      hitRate: total ? `${((this.hits / total) * 100).toFixed(1)}%` : "0%",
    };
  }
}

// One cache instance for the whole server
const messageCache = new LRUCache(50); // cache up to 50 chat histories
module.exports = { messageCache };
