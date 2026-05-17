// Sunucu icindeki rastgele/zamanli olaylari yonetir (meteor yagmuru, ikiye katlama saati, vb.)
class EventManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.log = ctx.logger.child('events');
    this.active = new Map();
    this.timers = [];
    this.events = [
      { id: 'double_gems', name: 'Cifte Gem Saati', dur: 15 * 60 * 1000, every: [60, 90] },
      { id: 'meteor', name: 'Meteor Yagmuru', dur: 5 * 60 * 1000, every: [40, 80] },
      { id: 'bonus_xp', name: '%200 XP Bonusu', dur: 20 * 60 * 1000, every: [70, 120] },
      { id: 'rare_drop', name: 'Nadir Dusurme Etkinligi', dur: 10 * 60 * 1000, every: [50, 100] },
      { id: 'flash_sale', name: 'Flas Magaza Indirimi', dur: 10 * 60 * 1000, every: [80, 150] }
    ];
  }

  isActive(id) { return this.active.has(id); }
  listActive() { return [...this.active.entries()].map(([id, info]) => ({ id, ...info, remaining: info.until - Date.now() })); }
  multiplier(kind) {
    if (kind === 'gems' && this.isActive('double_gems')) return 2;
    if (kind === 'xp' && this.isActive('bonus_xp')) return 3;
    return 1;
  }

  start(id, durMs) {
    const def = this.events.find(e => e.id === id);
    if (!def) return false;
    const until = Date.now() + (durMs || def.dur);
    this.active.set(id, { name: def.name, until });
    this.ctx.chat.system(`* Etkinlik basladi: ${def.name}!`, 'global');
    this.log.event(`event start: ${id}`);
    setTimeout(() => this.stop(id), durMs || def.dur);
    return true;
  }

  stop(id) {
    if (!this.active.has(id)) return false;
    const info = this.active.get(id);
    this.active.delete(id);
    this.ctx.chat.system(`* Etkinlik bitti: ${info.name}`, 'global');
    this.log.event(`event stop: ${id}`);
    return true;
  }

  schedule() {
    for (const e of this.events) {
      const ms = (Math.floor(Math.random() * (e.every[1] - e.every[0])) + e.every[0]) * 60 * 1000;
      this.timers.push(setTimeout(() => {
        this.start(e.id);
        this.schedule();
      }, ms));
    }
  }

  stopAll() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    for (const id of [...this.active.keys()]) this.stop(id);
  }
}

module.exports = EventManager;
