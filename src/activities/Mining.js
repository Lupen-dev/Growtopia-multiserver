// Madencilik - kazma seviyesine gore daha nadir madenler
class Mining {
  constructor() { this.cooldowns = new Map(); }
  init(ctx) { this.ctx = ctx; this.cd = ctx.config.activities.miningCooldownSec * 1000; }

  pickaxePower(player) {
    if (player.inventory[13]) return 12;
    if (player.inventory[12]) return 6;
    if (player.inventory[11]) return 3;
    if (player.inventory[10]) return 1;
    return 0;
  }

  dig(player) {
    const power = this.pickaxePower(player);
    if (!power) return { ok: false, error: 'Kazma lazim (id:10/11/12/13).' };
    const now = Date.now();
    const last = this.cooldowns.get(player.key) || 0;
    if (now - last < this.cd) return { ok: false, error: `Bekle: ${Math.ceil((this.cd - (now - last)) / 1000)}sn` };
    this.cooldowns.set(player.key, now);

    const r = Math.random() * 100;
    let ore, xp;
    const luck = Math.min(power, 12);
    if (r < 50 - luck * 2) { ore = this.ctx.items.get(120); xp = 5; }       // Iron
    else if (r < 80 - luck) { ore = this.ctx.items.get(121); xp = 20; }      // Gold
    else if (r < 95) { ore = this.ctx.items.get(122); xp = 75; }             // Diamond
    else { ore = this.ctx.items.get(123); xp = 250; }                        // Mystic Crystal

    const mult = this.ctx.events.multiplier('gems');
    const gems = Math.floor(ore.value * 0.4 * mult);
    this.ctx.players.addItem(player, ore.id);
    this.ctx.economy.add(player, gems);
    const leveled = this.ctx.players.addXp(player, xp * this.ctx.events.multiplier('xp'));
    player.stats.mined++;
    if (ore.id === 123) this.ctx.chat.system(`* ${player.name} MYSTIC CRYSTAL kazdi!`, 'global');
    let msg = `Kazdin: ${ore.name} +${gems}g +${xp}xp`;
    if (leveled) msg += ` LEVEL UP!`;
    return { ok: true, text: msg };
  }
}
module.exports = Mining;
