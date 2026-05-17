class BanManager {
  constructor(db, logger) {
    this.db = db;
    this.log = logger.child('bans');
    this.data = db.load('bans', { banned: [], muted: [], jailed: [] });
  }

  cleanup() {
    const now = Date.now();
    this.data.muted = this.data.muted.filter(m => !m.until || m.until > now);
    this.data.jailed = this.data.jailed.filter(j => !j.until || j.until > now);
    this.db.mark('bans');
  }

  isBanned(name) {
    this.cleanup();
    return this.data.banned.find(b => b.name.toLowerCase() === name.toLowerCase() && (!b.until || b.until > Date.now()));
  }
  isMuted(name) {
    this.cleanup();
    return this.data.muted.find(b => b.name.toLowerCase() === name.toLowerCase());
  }
  isJailed(name) {
    this.cleanup();
    return this.data.jailed.find(b => b.name.toLowerCase() === name.toLowerCase());
  }

  ban(name, by, reason, mins) {
    this.unban(name);
    this.data.banned.push({ name, by, reason, at: Date.now(), until: mins ? Date.now() + mins * 60000 : null });
    this.db.mark('bans');
  }
  unban(name) {
    const before = this.data.banned.length;
    this.data.banned = this.data.banned.filter(b => b.name.toLowerCase() !== name.toLowerCase());
    this.db.mark('bans');
    return this.data.banned.length < before;
  }
  mute(name, by, reason, mins) {
    this.unmute(name);
    this.data.muted.push({ name, by, reason, at: Date.now(), until: Date.now() + mins * 60000 });
    this.db.mark('bans');
  }
  unmute(name) {
    const before = this.data.muted.length;
    this.data.muted = this.data.muted.filter(b => b.name.toLowerCase() !== name.toLowerCase());
    this.db.mark('bans');
    return this.data.muted.length < before;
  }
  jail(name, by, reason, mins) {
    this.unjail(name);
    this.data.jailed.push({ name, by, reason, at: Date.now(), until: Date.now() + mins * 60000 });
    this.db.mark('bans');
  }
  unjail(name) {
    const before = this.data.jailed.length;
    this.data.jailed = this.data.jailed.filter(b => b.name.toLowerCase() !== name.toLowerCase());
    this.db.mark('bans');
    return this.data.jailed.length < before;
  }

  list() { this.cleanup(); return { ...this.data }; }
}

module.exports = BanManager;
