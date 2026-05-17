// Piyango - bilet, havuz, cekilis
class Lottery {
  init(ctx) { this.ctx = ctx; }
  buy(player, qty) {
    qty = Math.max(1, Math.min(50, qty || 1));
    let bought = 0;
    for (let i = 0; i < qty; i++) {
      const r = this.ctx.economy.buyLotteryTicket(player);
      if (!r.ok) break;
      bought++;
    }
    if (!bought) return { ok: false, error: 'Yetersiz gems.' };
    return { ok: true, text: `${bought} bilet alindi. Havuz: ${this.ctx.economy.data.lotteryPot}` };
  }
  status() {
    return { ok: true, text: `Piyango havuzu: ${this.ctx.economy.data.lotteryPot}g. Bilet: ${this.ctx.economy.data.lotteryTickets.length}` };
  }
  draw() {
    const r = this.ctx.economy.drawLottery(this.ctx.players);
    if (!r) return null;
    this.ctx.chat.system(`* PIYANGO! ${r.winner} ${r.pot} gem kazandi!`, 'global');
    this.ctx.audit.record('lottery.draw', 'SYSTEM', r.winner, { pot: r.pot });
    return r;
  }
}
module.exports = Lottery;
