// Parkur etkinligi - katilanlardan rastgele biri kazanir (simulasyon)
class Parkour {
  init(ctx) { this.ctx = ctx; this.active = null; this.participants = new Set(); }

  start() {
    if (this.active) return false;
    this.participants = new Set();
    this.active = { startedAt: Date.now(), prize: 2500 };
    this.ctx.chat.system('* PARKUR! 60sn icinde /parkour ile katil! Odul: 2500g', 'global');
    setTimeout(() => this.finish(), 60 * 1000);
    return true;
  }

  join(player) {
    if (!this.active) return { ok: false, error: 'Aktif parkur yok.' };
    if (this.participants.has(player.key)) return { ok: false, error: 'Zaten katildin.' };
    this.participants.add(player.key);
    return { ok: true, text: `Parkura katildin. (${this.participants.size} kisi)` };
  }

  finish() {
    if (!this.active) return;
    const keys = [...this.participants];
    if (!keys.length) {
      this.ctx.chat.system('* Parkur iptal: katilan yok.', 'global');
      this.active = null; return;
    }
    const sorted = keys.map(k => ({ k, time: Math.random() })).sort((a, b) => a.time - b.time);
    const podium = sorted.slice(0, 3);
    const prizes = [this.active.prize, Math.floor(this.active.prize / 2), Math.floor(this.active.prize / 4)];
    podium.forEach((p, i) => {
      const player = this.ctx.players.data.players[p.k];
      if (player) {
        this.ctx.economy.add(player, prizes[i]);
        this.ctx.players.addXp(player, 50 * (3 - i));
      }
    });
    this.ctx.chat.system(`* Parkur bitti! 1. ${podium[0] && this.ctx.players.data.players[podium[0].k]?.name} 2. ${podium[1] && this.ctx.players.data.players[podium[1].k]?.name || '-'} 3. ${podium[2] && this.ctx.players.data.players[podium[2].k]?.name || '-'}`, 'global');
    this.active = null;
  }
}
module.exports = Parkour;
