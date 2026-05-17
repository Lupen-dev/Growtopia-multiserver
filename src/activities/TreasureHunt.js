// Hazine avi: 10x10 izgara, hot/cold ipucu
class TreasureHunt {
  init(ctx) { this.ctx = ctx; this.games = new Map(); }

  start(player) {
    if (this.games.has(player.key)) return { ok: false, error: 'Aktif avin var. /dig <x> <y>' };
    const tx = Math.floor(Math.random() * 10);
    const ty = Math.floor(Math.random() * 10);
    this.games.set(player.key, { tx, ty, tries: 0, max: 8, last: null });
    return { ok: true, text: 'Hazine avi basladi! 10x10 izgara, 8 deneme. /dig <x> <y> (x,y 0-9).' };
  }

  dist(g, x, y) { return Math.max(Math.abs(g.tx - x), Math.abs(g.ty - y)); }

  dig(player, x, y) {
    const g = this.games.get(player.key); if (!g) return { ok: false, error: 'Once /treasure.' };
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 9 || y < 0 || y > 9) return { ok: false, error: 'x,y 0-9.' };
    g.tries++;
    if (x === g.tx && y === g.ty) {
      const it = this.ctx.items.weightedRandom();
      this.ctx.players.addItem(player, it.id);
      const gems = 1000 + Math.floor(Math.random() * 4000);
      this.ctx.economy.add(player, gems);
      this.ctx.players.addXp(player, 100);
      this.games.delete(player.key);
      return { ok: true, text: `HAZINE BULUNDU! +${gems}g +${it.name}` };
    }
    if (g.tries >= g.max) {
      this.games.delete(player.key);
      return { ok: true, text: `Denemeler bitti! Hazine: (${g.tx},${g.ty})` };
    }
    const d = this.dist(g, x, y);
    let hint;
    if (d <= 1) hint = 'COK SICAK!';
    else if (d <= 2) hint = 'sicak';
    else if (d <= 4) hint = 'ilik';
    else if (d <= 6) hint = 'soguk';
    else hint = 'BUZ GIBI';
    g.last = { x, y };
    return { ok: true, text: `(${x},${y}) -> ${hint}. Kalan: ${g.max - g.tries}` };
  }
}
module.exports = TreasureHunt;
