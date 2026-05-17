const Perms = require('./Permissions');

class ChatManager {
  constructor(db, config, logger, bans) {
    this.db = db;
    this.config = config;
    this.log = logger.child('chat');
    this.bans = bans;
    this.data = db.load('chatlog', { messages: [] });
    this.lastTalk = new Map();
    this.subscribers = new Set();
  }

  subscribe(fn) { this.subscribers.add(fn); return () => this.subscribers.delete(fn); }

  filter(text) {
    let out = text;
    for (const w of this.config.moderation.filteredWords) {
      if (!w) continue;
      out = out.replace(new RegExp(w, 'gi'), '*'.repeat(w.length));
    }
    return out;
  }

  canTalk(player) {
    if (this.bans.isMuted(player.name)) return { ok: false, reason: 'Suanda susturuldun.' };
    const now = Date.now();
    const prev = this.lastTalk.get(player.key) || 0;
    const gap = 1000 / this.config.moderation.chatRateLimitPerSec;
    if (now - prev < gap) return { ok: false, reason: 'Cok hizli yaziyorsun, biraz yavasla.' };
    this.lastTalk.set(player.key, now);
    return { ok: true };
  }

  push(entry) {
    entry.ts = Date.now();
    this.data.messages.push(entry);
    if (this.data.messages.length > 1000) this.data.messages.splice(0, this.data.messages.length - 1000);
    this.db.mark('chatlog');
    for (const s of this.subscribers) try { s(entry); } catch {}
  }

  say(player, text, scope = 'world') {
    const c = this.canTalk(player);
    if (!c.ok) return { ok: false, error: c.reason };
    const clean = this.filter(text);
    const entry = {
      type: 'chat', scope, player: player.name, role: player.role,
      world: player.world, text: clean,
      tag: Perms.TAGS[player.role] || '', color: Perms.COLORS[player.role] || '#fff'
    };
    this.push(entry);
    return { ok: true, entry };
  }

  system(text, scope = 'global') {
    const entry = { type: 'system', scope, text };
    this.push(entry);
    return entry;
  }

  recent(n = 50, scope) {
    const arr = scope ? this.data.messages.filter(m => m.scope === scope) : this.data.messages;
    return arr.slice(-n);
  }
}

module.exports = ChatManager;
