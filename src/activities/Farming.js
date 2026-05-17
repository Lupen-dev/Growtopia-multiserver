// Tarla mekanigi - tohum ek, bekle, hasat yap
class Farming {
  init(ctx) { this.ctx = ctx; this.cd = ctx.config.activities.farmingCooldownSec * 1000; }

  plant(player) {
    if (player.farm && player.farm.until > Date.now()) {
      return { ok: false, error: `Tarlanda urun var, ${Math.ceil((player.farm.until - Date.now()) / 1000)}sn sonra hasat yap.` };
    }
    const seedId = player.inventory[31] ? 31 : (player.inventory[30] ? 30 : null);
    if (!seedId) return { ok: false, error: 'Tohum yok (id:30 veya 31).' };
    this.ctx.players.removeItem(player, seedId);
    const grow = seedId === 31 ? this.cd * 4 : this.cd;
    player.farm = { seed: seedId, until: Date.now() + grow };
    this.ctx.db.mark('players');
    return { ok: true, text: `Ektin (${seedId === 31 ? 'rare' : 'normal'}). Hasat: ${Math.ceil(grow / 1000)}sn sonra.` };
  }

  harvest(player) {
    if (!player.farm) return { ok: false, error: 'Once /farm plant.' };
    if (player.farm.until > Date.now()) return { ok: false, error: `Bekle: ${Math.ceil((player.farm.until - Date.now()) / 1000)}sn` };
    const rare = player.farm.seed === 31;
    const gems = (rare ? 200 : 25) * this.ctx.events.multiplier('gems');
    const xp = (rare ? 50 : 10) * this.ctx.events.multiplier('xp');
    this.ctx.economy.add(player, gems);
    this.ctx.players.addXp(player, xp);
    const drop = rare ? this.ctx.items.weightedRandom() : this.ctx.items.get(40); // apple by default
    this.ctx.players.addItem(player, drop.id);
    player.stats.harvested++;
    player.farm = null; this.ctx.db.mark('players');
    return { ok: true, text: `Hasat: +${gems}g +${xp}xp, drop: ${drop.name}` };
  }

  status(player) {
    if (!player.farm) return { ok: true, text: 'Tarlan bos. /farm plant' };
    const left = player.farm.until - Date.now();
    return { ok: true, text: left <= 0 ? 'Hasata hazir! /farm harvest' : `Olgunlasiyor: ${Math.ceil(left / 1000)}sn` };
  }
}
module.exports = Farming;
