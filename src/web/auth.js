const crypto = require('crypto');

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const newSalt = () => crypto.randomBytes(8).toString('hex');

class WebAuth {
  constructor(db, config, logger) {
    this.db = db;
    this.cfg = config;
    this.log = logger.child('webauth');
    this.data = db.load('webusers', { users: [] });
    if (!this.data.users.length) {
      const salt = newSalt();
      this.data.users.push({
        username: config.admin.defaultUsername,
        passwordHash: hash(config.admin.defaultPassword, salt),
        salt, role: 'owner', createdAt: Date.now()
      });
      db.mark('webusers');
      this.log.warn('Varsayilan admin kullanici olusturuldu: ' + config.admin.defaultUsername);
    }
    this.sessions = new Map();
  }

  user(username) { return this.data.users.find(u => u.username === username); }

  login(username, password) {
    const u = this.user(username);
    if (!u) return { ok: false, error: 'Kullanici yok.' };
    if (hash(password, u.salt) !== u.passwordHash) return { ok: false, error: 'Sifre yanlis.' };
    const token = crypto.randomBytes(24).toString('hex');
    this.sessions.set(token, { username: u.username, role: u.role, until: Date.now() + this.cfg.web.sessionTtlHours * 3600 * 1000 });
    return { ok: true, token, role: u.role, username: u.username };
  }

  validate(token) {
    const s = this.sessions.get(token);
    if (!s) return null;
    if (s.until < Date.now()) { this.sessions.delete(token); return null; }
    return s;
  }

  logout(token) { this.sessions.delete(token); }

  changePassword(username, newPw) {
    const u = this.user(username); if (!u) return false;
    u.salt = newSalt(); u.passwordHash = hash(newPw, u.salt);
    this.db.mark('webusers');
    return true;
  }

  create(username, password, role) {
    if (this.user(username)) return { ok: false, error: 'Var.' };
    const salt = newSalt();
    this.data.users.push({ username, passwordHash: hash(password, salt), salt, role, createdAt: Date.now() });
    this.db.mark('webusers');
    return { ok: true };
  }

  remove(username) {
    const idx = this.data.users.findIndex(u => u.username === username);
    if (idx === -1) return false;
    this.data.users.splice(idx, 1);
    this.db.mark('webusers');
    return true;
  }
}

module.exports = WebAuth;
