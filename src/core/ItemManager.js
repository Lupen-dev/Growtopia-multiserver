class ItemManager {
  constructor(db, logger) {
    this.db = db;
    this.log = logger.child('items');
    this.data = db.load('items', { items: [], tiers: {} });
    this.byId = new Map(this.data.items.map(i => [i.id, i]));
    this.byName = new Map(this.data.items.map(i => [i.name.toLowerCase(), i]));
  }

  get(id) { return this.byId.get(Number(id)); }
  find(name) { return this.byName.get(String(name).toLowerCase()); }
  list() { return [...this.byId.values()]; }
  byCategory(cat) { return this.list().filter(i => i.category === cat); }
  byRarity(r) { return this.list().filter(i => i.rarity === r); }
  tier(r) { return this.data.tiers[r] || { color: '#fff', multiplier: 1 }; }

  randomByRarity(rarity) {
    const pool = this.byRarity(rarity);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  weightedRandom() {
    const weights = { common: 60, uncommon: 25, rare: 10, epic: 4, legendary: 1 };
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [tier, w] of Object.entries(weights)) {
      r -= w;
      if (r <= 0) return this.randomByRarity(tier);
    }
    return this.randomByRarity('common');
  }
}

module.exports = ItemManager;
