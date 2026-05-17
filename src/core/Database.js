const fs = require('fs');
const path = require('path');

class Database {
  constructor(runtimeDir, logger) {
    this.dir = runtimeDir;
    this.log = logger.child('db');
    this.tables = {};
    this.dirty = new Set();
    this.saveInterval = null;
    if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
  }

  load(name, fallback) {
    const file = path.join(this.dir, name + '.json');
    if (fs.existsSync(file)) {
      try { this.tables[name] = JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch (e) { this.log.error(`${name} okunamadi, varsayilana donuluyor`, { err: e.message }); this.tables[name] = fallback; }
    } else { this.tables[name] = fallback; this.dirty.add(name); }
    return this.tables[name];
  }
  get(name) { return this.tables[name]; }
  mark(name) { this.dirty.add(name); }

  saveOne(name) {
    if (!this.tables[name]) return;
    const file = path.join(this.dir, name + '.json');
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.tables[name], null, 2));
    fs.renameSync(tmp, file);
  }

  saveAll(force = false) {
    const names = force ? Object.keys(this.tables) : [...this.dirty];
    for (const n of names) {
      try { this.saveOne(n); } catch (e) { this.log.error(`${n} kaydedilemedi`, { err: e.message }); }
    }
    this.dirty.clear();
  }

  startAutoSave(intervalMs = 15000) {
    this.saveInterval = setInterval(() => this.saveAll(false), intervalMs);
  }

  stop() {
    if (this.saveInterval) clearInterval(this.saveInterval);
    this.saveAll(true);
  }
}

module.exports = Database;
