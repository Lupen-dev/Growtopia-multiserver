const crypto = require('crypto');
const Perms = require('./Permissions');

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const newSalt = () => crypto.randomBytes(8).toString('hex');

class PlayerManager {
  constructor(db, config, logger) {
    this.db = db;
    this.config = config;
    this.log = logger.child('players');
    this.data = db.load('players', { players: {} });
    this.online = new Map();
    this.byId = new Map();
    this.nextId = Math.max(0, ...Object.values(this.data.players).map(p => p.id || 0)) + 1;
  }

  get(name) { return this.data.players[name.toLowerCase()]; }
  all() { return Object.values(this.data.players); }
  online_list() { return [...this.online.values()]; }
  count() { return Object.keys(this.data.players).length; }
  onlineCount() { return this.online.size; }

  register(name, password) {
    const key = name.toLowerCase();
    if (this.data.players[key]) return { ok: false, error: 'Bu isim zaten alinmis.' };
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(name)) return { ok: false, error: 'Isim 3-20 karakter, sadece harf/rakam/_ olmali.' };
    if (!password || password.length < 4) return { ok: false, error: 'Sifre en az 4 karakter olmali.' };
    const salt = newSalt();
    const p = {
      id: this.nextId++,
      name, key,
      passwordHash: hash(password, salt), salt,
      role: 'player',
      gems: this.config.economy.startingGems,
      level: 1, xp: 0,
      health: 100, maxHealth: 100,
      inventory: { 1: 99, 30: 5, 40: 3, 10: 1 },
      equipped: {},
      stats: { kills: 0, deaths: 0, fish: 0, mined: 0, harvested: 0, won: 0, lost: 0, playtimeSec: 0 },
      world: 'START',
      home: 'START',
      x: 5, y: 10,
      friends: [], blocked: [],
      clan: null, title: '', nameColor: '#ffffff',
      lastDaily: 0, lastVote: 0,
      warns: 0, badges: [],
      createdAt: Date.now(), lastSeen: Date.now()
    };
    this.data.players[key] = p;
    this.db.mark('players');
    this.log.success(`yeni oyuncu kaydoldu: ${name}`);
    return { ok: true, player: p };
  }

  login(name, password) {
    const p = this.get(name);
    if (!p) return { ok: false, error: 'Oyuncu bulunamadi.' };
    if (hash(password, p.salt) !== p.passwordHash) return { ok: false, error: 'Sifre yanlis.' };
    return { ok: true, player: p };
  }

  attachConnection(player, conn) {
    player.lastSeen = Date.now();
    player.conn = conn;
    this.online.set(player.key, player);
    this.byId.set(player.id, player);
    this.db.mark('players');
  }

  detachConnection(player) {
    if (!player) return;
    player.lastSeen = Date.now();
    delete player.conn;
    this.online.delete(player.key);
    this.byId.delete(player.id);
    this.db.mark('players');
  }

  addXp(player, amount) {
    player.xp += amount;
    let leveled = false;
    while (player.level < this.config.leveling.maxLevel) {
      const need = Math.floor(this.config.leveling.xpPerLevel * Math.pow(this.config.leveling.xpMultiplier, player.level - 1));
      if (player.xp < need) break;
      player.xp -= need;
      player.level++;
      leveled = true;
    }
    this.db.mark('players');
    return leveled;
  }

  xpForNext(player) {
    return Math.floor(this.config.leveling.xpPerLevel * Math.pow(this.config.leveling.xpMultiplier, player.level - 1));
  }

  setRole(player, role) {
    if (!Perms.ROLES.includes(role)) return false;
    player.role = role;
    this.db.mark('players');
    return true;
  }

  addItem(player, itemId, qty = 1) {
    player.inventory[itemId] = (player.inventory[itemId] || 0) + qty;
    this.db.mark('players');
  }
  removeItem(player, itemId, qty = 1) {
    const have = player.inventory[itemId] || 0;
    if (have < qty) return false;
    player.inventory[itemId] = have - qty;
    if (player.inventory[itemId] <= 0) delete player.inventory[itemId];
    this.db.mark('players');
    return true;
  }

  search(query, limit = 20) {
    const q = query.toLowerCase();
    return this.all().filter(p => p.key.includes(q)).slice(0, limit);
  }

  changePassword(player, newPw) {
    const salt = newSalt();
    player.salt = salt;
    player.passwordHash = hash(newPw, salt);
    this.db.mark('players');
  }
}

module.exports = PlayerManager;
