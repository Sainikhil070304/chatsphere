class TrieNode {
  constructor() {
    this.children = {};
    this.isEnd = false;
    this.user = null;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(user) {
    if (!user || !user.username) return;
    this._insert(user.username.toLowerCase(), user);
    if (user.firstName) this._insert(user.firstName.toLowerCase(), user);
  }

  _insert(word, user) {
    if (!word) return;
    let node = this.root;
    for (const ch of word) {
      if (!node.children[ch]) node.children[ch] = new TrieNode();
      node = node.children[ch];
    }
    node.isEnd = true;
    node.user = {
      _id: user._id,
      username: user.username,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      avatar: user.avatar || "",
    };
  }

  search(prefix, limit = 10) {
    if (!prefix) return [];
    let node = this.root;
    for (const ch of prefix.toLowerCase()) {
      if (!node.children[ch]) return [];
      node = node.children[ch];
    }
    const results = [];
    const seen = new Set();
    this._dfs(node, results, seen, limit);
    return results;
  }

  _dfs(node, results, seen, limit) {
    if (results.length >= limit) return;
    if (node.isEnd && node.user) {
      const id = node.user._id.toString();
      if (!seen.has(id)) {
        seen.add(id);
        results.push(node.user);
      }
    }
    for (const child of Object.values(node.children)) {
      this._dfs(child, results, seen, limit);
    }
  }

  remove(username) {
    if (!username) return;
    let node = this.root;
    for (const ch of username.toLowerCase()) {
      if (!node.children[ch]) return;
      node = node.children[ch];
    }
    node.isEnd = false;
    node.user = null;
  }

  // Accepts the mongoose model directly, no magic
  async rebuild(UserModel) {
    try {
      this.root = new TrieNode();
      // Use mongoose model's find method directly
      const users = await UserModel.find(
        {},
        { username: 1, firstName: 1, lastName: 1, avatar: 1 }
      ).lean();
      let count = 0;
      for (const u of users) {
        if (u.username) {
          this.insert(u);
          count++;
        }
      }
      console.log(`🔍 Trie built: ${count} users indexed`);
    } catch (err) {
      console.error("❌ Trie rebuild failed:", err.message);
    }
  }
}

const userTrie = new Trie();
module.exports = { userTrie };