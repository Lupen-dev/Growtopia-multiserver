const WORLD_WIDTH = 60;
const WORLD_HEIGHT = 30;

class WorldManager {
  constructor(db, logger) {
    this.db = db;
    this.log = logger.child('worlds');
    this.data = db.load('worlds', { worlds: [] });
    this.map = new Map();
    for (const w of this.data.worlds) {
      if (!w.players) w.players = [];
      this.map.set(w.name.toUpperCase(), w);
    }
  }

  get(name) { return this.map.get(String(name).toUpperCase()); }
  list() { return [...this.map.values()]; }
  count() { return this.map.size; }

  create(name, owner) {
    const key = String(name).toUpperCase();
    if (!/^[A-Z0-9]{1,24}$/.test(key)) return { ok: false, error: 'Dunya adi 1-24 buyuk harf/rakam olmali.' };
    if (this.map.has(key)) return { ok: false, error: 'Bu isimde dunya zaten var.' };
    const w = {
      name: key, owner, visits: 0, blocks: [], players: [],
      spawn: { x: Math.floor(WORLD_WIDTH / 2), y: 10 },
      locked: false, public: true,
      width: WORLD_WIDTH, height: WORLD_HEIGHT,
      createdAt: Date.now()
    };
    this.data.worlds.push(w);
    this.map.set(key, w);
    this.db.mark('worlds');
    return { ok: true, world: w };
  }

  remove(name) {
    const key = String(name).toUpperCase();
    const idx = this.data.worlds.findIndex(w => w.name === key);
    if (idx === -1) return false;
    this.data.worlds.splice(idx, 1);
    this.map.delete(key);
    this.db.mark('worlds');
    return true;
  }

  enter(player, name) {
    const w = this.get(name);
    if (!w) return { ok: false, error: 'Dunya bulunamadi.' };
    if (w.locked && w.owner !== player.name) return { ok: false, error: 'Bu dunya kilitli.' };
    const prev = this.get(player.world);
    if (prev) prev.players = prev.players.filter(n => n !== player.name);
    w.players.push(player.name);
    w.visits++;
    player.world = w.name;
    player.x = w.spawn.x;
    player.y = w.spawn.y;
    this.db.mark('worlds');
    this.db.mark('players');
    return { ok: true, world: w };
  }

  leave(player) {
    const w = this.get(player.world);
    if (w) {
      w.players = w.players.filter(n => n !== player.name);
      this.db.mark('worlds');
    }
  }

  lock(name, owner) {
    const w = this.get(name);
    if (!w) return false;
    if (w.owner !== owner && w.owner !== 'SYSTEM') return false;
    w.locked = true;
    this.db.mark('worlds');
    return true;
  }
  unlock(name, owner) {
    const w = this.get(name);
    if (!w) return false;
    if (w.owner !== owner && w.owner !== 'SYSTEM') return false;
    w.locked = false;
    this.db.mark('worlds');
    return true;
  }

  topVisited(n = 10) {
    return this.list().sort((a, b) => b.visits - a.visits).slice(0, n);
  }

  occupants(name) {
    const w = this.get(name);
    return w ? [...w.players] : [];
  }
}

WorldManager.WIDTH = WORLD_WIDTH;
WorldManager.HEIGHT = WORLD_HEIGHT;
module.exports = WorldManager;
