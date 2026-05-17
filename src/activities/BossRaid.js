// Global boss raid: tum oyuncular birlikte vurur. HP biterse hepsi pay alir.
const BOSSES = [
  { name: 'Karanlik Ejderha', hp: 50000, gems: 25000 },
  { name: 'Volkan Devi', hp: 35000, gems: 18000 },
  { name: 'Buz Lich', hp: 25000, gems: 12000 },
  { name: 'Golge Imparatoru', hp: 80000, gems: 45000 }
];

class BossRaid {
  init(ctx) { this.ctx = ctx; this.boss = null; }

  start() {
    if (this.boss) return false;
    const b = BOSSES[Math.floor(Math.random() * BOSSES.length)];
    this.boss = { ...b, maxHp: b.hp, attackers: new Map(), startedAt: Date.now() };
    this.ctx.chat.system(`* BOSS RAID! ${b.name} (${b.hp}HP) belirdi! /boss hit ile vur. Odul havuzu: ${b.gems}g`, 'global');
    setTimeout(() => this.timeout(), 15 * 60 * 1000);
    return true;
  }

  hit(player) {
    if (!this.boss) return { ok: false, error: 'Aktif boss yok.' };
    const w = (() => { for (const id of [53, 52, 51, 50]) if (player.inventory[id]) return this.ctx.items.get(id); return null; })();
    if (!w) return { ok: false, error: 'Silah lazim (id:50-53).' };
    const dmg = Math.floor(w.damage * (0.8 + Math.random() * 0.6)) + Math.floor(player.level / 2);
    this.boss.hp -= dmg;
    this.boss.attackers.set(player.key, (this.boss.attackers.get(player.key) || 0) + dmg);
    if (this.boss.hp <= 0) return this.defeat();
    return { ok: true, text: `${this.boss.name} HP:${this.boss.hp}/${this.boss.maxHp}. Verdigin: ${dmg}` };
  }

  defeat() {
    const total = [...this.boss.attackers.values()].reduce((a, b) => a + b, 0);
    const lines = ['* BOSS YENILDI! Pay dagilimi:'];
    for (const [key, dmg] of this.boss.attackers.entries()) {
      const p = this.ctx.players.data.players[key]; if (!p) continue;
      const share = Math.floor((dmg / total) * this.boss.gems);
      this.ctx.economy.add(p, share);
      this.ctx.players.addXp(p, Math.floor(dmg / 10));
      lines.push(`  ${p.name}: ${share}g (${dmg} dmg)`);
    }
    this.ctx.chat.system(lines.join('\n'), 'global');
    const topAttacker = [...this.boss.attackers.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topAttacker) {
      const p = this.ctx.players.data.players[topAttacker[0]];
      if (p) {
        this.ctx.players.addItem(p, 102); // Boss Key
        this.ctx.chat.system(`* En cok hasar veren ${p.name} bonus Boss Key kazandi!`, 'global');
      }
    }
    this.boss = null;
    return { ok: true, text: 'BOSS YENILDI!' };
  }

  timeout() {
    if (!this.boss) return;
    this.ctx.chat.system(`* ${this.boss.name} kactiniz. Yenilemediniz!`, 'global');
    this.boss = null;
  }

  status(player) {
    if (!this.boss) return { ok: true, text: 'Aktif boss yok. Periyodik olarak spawn olur.' };
    const myDmg = this.boss.attackers.get(player.key) || 0;
    return { ok: true, text: `${this.boss.name} HP:${this.boss.hp}/${this.boss.maxHp}. Senin hasarin: ${myDmg}` };
  }
}
module.exports = BossRaid;
