// Tur tabanli basit PvP duello sistemi
class PvP {
  init(ctx) { this.ctx = ctx; this.pending = new Map(); this.active = new Map(); }

  weapon(p) {
    for (const id of [53, 52, 51, 50]) if (p.inventory[id]) return this.ctx.items.get(id);
    return null;
  }
  armor(p) {
    for (const id of [62, 61, 60]) if (p.inventory[id]) return this.ctx.items.get(id);
    return null;
  }

  challenge(challenger, targetName, wager) {
    if (!targetName) return { ok: false, error: 'kullanim: /pvp <oyuncu> [bahis]' };
    const t = this.ctx.players.get(targetName); if (!t) return { ok: false, error: 'Oyuncu yok.' };
    if (t.key === challenger.key) return { ok: false, error: 'Kendinle dovusemezsin.' };
    if (this.active.has(challenger.key)) return { ok: false, error: 'Zaten dovusuyorsun.' };
    if (wager && challenger.gems < wager) return { ok: false, error: 'Yetersiz bahis.' };
    this.pending.set(t.key, { challenger: challenger.key, wager: wager || 0, ts: Date.now() });
    this.ctx.chat.push({ type: 'system', text: `* ${challenger.name}, ${t.name} oyuncusunu duelloya cagirdi (${wager || 0}g). /accept`, scope: 'world:' + t.world });
    return { ok: true, text: 'Davet gonderildi.' };
  }

  accept(player) {
    const inv = this.pending.get(player.key);
    if (!inv) return { ok: false, error: 'Bekleyen davet yok.' };
    const c = this.ctx.players.data.players[inv.challenger];
    if (!c) return { ok: false, error: 'Cagirici yok.' };
    if (inv.wager && (c.gems < inv.wager || player.gems < inv.wager)) return { ok: false, error: 'Bahis yetmiyor.' };
    if (inv.wager) { c.gems -= inv.wager; player.gems -= inv.wager; }
    const w1 = this.weapon(c) || { damage: 3, name: 'Yumruk' };
    const w2 = this.weapon(player) || { damage: 3, name: 'Yumruk' };
    const a1 = this.armor(c) || { defense: 0 };
    const a2 = this.armor(player) || { defense: 0 };
    const fight = {
      a: { p: c, hp: 100 + (a1.defense * 2), weapon: w1, armor: a1 },
      b: { p: player, hp: 100 + (a2.defense * 2), weapon: w2, armor: a2 },
      pot: inv.wager * 2, turn: 'a', log: []
    };
    this.active.set(c.key, fight); this.active.set(player.key, fight);
    this.pending.delete(player.key);
    this.ctx.db.mark('players');
    return { ok: true, text: `DUELLO! ${c.name}(${fight.a.hp}HP/${w1.name}) vs ${player.name}(${fight.b.hp}HP/${w2.name}). Sira: ${c.name}. /attack` };
  }

  attack(player) {
    const f = this.active.get(player.key); if (!f) return { ok: false, error: 'Aktif duello yok.' };
    const me = f.a.p.key === player.key ? f.a : f.b;
    const opp = me === f.a ? f.b : f.a;
    if (f.turn !== (me === f.a ? 'a' : 'b')) return { ok: false, error: 'Rakibin sirasi.' };
    const dmg = Math.max(1, Math.floor(me.weapon.damage * (0.8 + Math.random() * 0.5)) - Math.floor(opp.armor.defense / 3));
    opp.hp -= dmg;
    f.log.push(`${me.p.name} ${opp.p.name} oyuncusuna ${dmg} hasar verdi.`);
    if (opp.hp <= 0) {
      me.p.stats.kills++; opp.p.stats.deaths++;
      const winGems = f.pot + this.ctx.config.economy.killReward;
      this.ctx.economy.add(me.p, winGems);
      this.ctx.chat.system(`* ${me.p.name} duelloda ${opp.p.name} oyuncusunu YENDI! +${winGems}g`, 'global');
      this.active.delete(f.a.p.key); this.active.delete(f.b.p.key);
      return { ok: true, text: `Kazandin! Hasar: ${dmg} +${winGems}g` };
    }
    f.turn = me === f.a ? 'b' : 'a';
    return { ok: true, text: `Hasar:${dmg}. Rakip HP:${opp.hp}. Sira: ${opp.p.name}` };
  }

  flee(player) {
    const f = this.active.get(player.key); if (!f) return { ok: false, error: 'Aktif duello yok.' };
    this.active.delete(f.a.p.key); this.active.delete(f.b.p.key);
    const winner = f.a.p.key === player.key ? f.b.p : f.a.p;
    this.ctx.economy.add(winner, f.pot);
    return { ok: true, text: 'Kactin. Rakip kazandi.' };
  }
}
module.exports = PvP;
