// Balik tutma - bekleme suresi, nadir balik sansi, XP/gem odulu
class Fishing {
  constructor() { this.cooldowns = new Map(); }
  init(ctx) { this.ctx = ctx; this.cd = ctx.config.activities.fishingCooldownSec * 1000; }

  cast(player) {
    const now = Date.now();
    const last = this.cooldowns.get(player.key) || 0;
    if (now - last < this.cd) {
      return { ok: false, error: `Bekle: ${Math.ceil((this.cd - (now - last)) / 1000)}sn` };
    }
    if (!player.inventory[20] && !player.inventory[21]) return { ok: false, error: 'Olta lazim (id:20 veya 21).' };
    this.cooldowns.set(player.key, now);
    const r = Math.random();
    let fish, xp;
    if (r < 0.55) { fish = this.ctx.items.get(110); xp = 5; }     // common
    else if (r < 0.92) { fish = this.ctx.items.get(111); xp = 25; } // rare
    else { fish = this.ctx.items.get(112); xp = 100; }              // golden

    const mult = this.ctx.events.multiplier('gems');
    const gems = Math.floor(fish.value * 0.3 * mult);
    this.ctx.players.addItem(player, fish.id);
    this.ctx.economy.add(player, gems);
    const leveled = this.ctx.players.addXp(player, xp * this.ctx.events.multiplier('xp'));
    player.stats.fish++;
    if (fish.rarity === 'legendary') this.ctx.chat.system(`* ${player.name} ALTIN BALIK yakaladi!`, 'global');
    let msg = `Tuttun: ${fish.name} (${fish.rarity}) +${gems}g +${xp}xp`;
    if (leveled) msg += ` LEVEL UP! lvl${player.level}`;
    return { ok: true, text: msg };
  }
}
module.exports = Fishing;
