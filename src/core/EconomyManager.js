class EconomyManager {
  constructor(db, config, logger) {
    this.db = db;
    this.config = config;
    this.log = logger.child('economy');
    this.data = db.load('economy', { lotteryPot: 0, lotteryTickets: [], dailyClaims: {} });
  }

  add(player, amount, reason = '') {
    player.gems += amount;
    this.db.mark('players');
    return player.gems;
  }

  remove(player, amount, reason = '') {
    if (player.gems < amount) return false;
    player.gems -= amount;
    this.db.mark('players');
    return true;
  }

  transfer(from, to, amount) {
    if (from.gems < amount) return { ok: false, error: 'Yetersiz gems.' };
    const tax = Math.floor(amount * (this.config.economy.tradeTaxPercent / 100));
    from.gems -= amount;
    to.gems += amount - tax;
    this.db.mark('players');
    return { ok: true, tax };
  }

  daily(player) {
    const today = new Date().toISOString().slice(0, 10);
    if (this.data.dailyClaims[player.key] === today) return { ok: false, error: 'Bugunku odul zaten alindi.' };
    const streak = (this.data.dailyClaims[player.key + ':streak'] || 0) + 1;
    const reward = this.config.economy.dailyReward + (streak * 25);
    player.gems += reward;
    this.data.dailyClaims[player.key] = today;
    this.data.dailyClaims[player.key + ':streak'] = streak;
    this.db.mark('economy');
    this.db.mark('players');
    return { ok: true, reward, streak };
  }

  buyLotteryTicket(player) {
    const price = this.config.activities.lotteryTicketPrice;
    if (!this.remove(player, price)) return { ok: false, error: 'Yetersiz gems.' };
    this.data.lotteryPot += price;
    this.data.lotteryTickets.push({ player: player.name, ts: Date.now() });
    this.db.mark('economy');
    return { ok: true, pot: this.data.lotteryPot, tickets: this.data.lotteryTickets.length };
  }

  drawLottery(players) {
    if (this.data.lotteryTickets.length === 0) return null;
    const idx = Math.floor(Math.random() * this.data.lotteryTickets.length);
    const winnerEntry = this.data.lotteryTickets[idx];
    const winner = players.get(winnerEntry.player);
    const pot = this.data.lotteryPot;
    if (winner) winner.gems += pot;
    this.data.lotteryPot = 0;
    this.data.lotteryTickets = [];
    this.db.mark('economy');
    this.db.mark('players');
    return { winner: winnerEntry.player, pot };
  }

  topRich(players, n = 10) {
    return players.all().sort((a, b) => b.gems - a.gems).slice(0, n);
  }
}

module.exports = EconomyManager;
