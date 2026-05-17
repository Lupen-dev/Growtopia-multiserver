// Slot, Rulet, Blackjack, Coinflip, Dice
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

const SLOT_SYMBOLS = [
  { s: '7', weight: 1, pay: 50 },
  { s: 'BAR', weight: 3, pay: 20 },
  { s: 'CHERRY', weight: 6, pay: 8 },
  { s: 'LEMON', weight: 10, pay: 4 },
  { s: 'GRAPE', weight: 15, pay: 2 }
];
function rollSlot() {
  const pool = [];
  for (const x of SLOT_SYMBOLS) for (let i = 0; i < x.weight; i++) pool.push(x);
  return pick(pool);
}

class Casino {
  constructor() {
    this.bjGames = new Map();
  }
  init(ctx) {
    this.ctx = ctx;
    this.cfg = ctx.config.activities;
  }
  validateBet(player, amt) {
    if (!amt || amt < this.cfg.casinoMinBet) return { ok: false, error: `Min bahis ${this.cfg.casinoMinBet}.` };
    if (amt > this.cfg.casinoMaxBet) return { ok: false, error: `Max bahis ${this.cfg.casinoMaxBet}.` };
    if (player.gems < amt) return { ok: false, error: 'Yetersiz gems.' };
    return { ok: true };
  }
  menu() {
    return [
      '== CASINO ==',
      '/slots <bahis>          Slot makinasi',
      '/roulette <renk> <bahis> Rulet (red/black/green)',
      '/blackjack <bahis>      Blackjack (sonra /hit /stand)',
      '/coinflip <h|t> <bahis> Yazi/Tura',
      '/dice <1-6> <bahis>     Zar',
      `Limitler: ${this.cfg.casinoMinBet} - ${this.cfg.casinoMaxBet} gem`
    ].join('\n');
  }

  slots(player, bet) {
    const v = this.validateBet(player, bet); if (!v.ok) return v;
    this.ctx.economy.remove(player, bet);
    const a = rollSlot(), b = rollSlot(), c = rollSlot();
    let mult = 0;
    if (a.s === b.s && b.s === c.s) mult = a.pay;
    else if (a.s === b.s || b.s === c.s || a.s === c.s) mult = 2;
    const win = bet * mult;
    if (win > 0) this.ctx.economy.add(player, win);
    player.stats[win > 0 ? 'won' : 'lost']++;
    if (mult >= 20) this.ctx.chat.system(`* ${player.name} slotta JACKPOT! (${win}g) [${a.s}|${b.s}|${c.s}]`, 'global');
    return { ok: true, text: `[ ${a.s} | ${b.s} | ${c.s} ]  ${win > 0 ? '+' + win + ' (' + mult + 'x)' : '-' + bet}` };
  }

  roulette(player, pickArg, bet) {
    const v = this.validateBet(player, bet); if (!v.ok) return v;
    if (!pickArg) return { ok: false, error: 'kullanim: /roulette red|black|green|0-36 <bahis>' };
    this.ctx.economy.remove(player, bet);
    const num = Math.floor(Math.random() * 37);
    const color = num === 0 ? 'green' : (num % 2 === 0 ? 'black' : 'red');
    let win = 0, kind = '';
    if (pickArg === 'red' || pickArg === 'black') { if (pickArg === color) { win = bet * 2; kind = 'renk'; } }
    else if (pickArg === 'green') { if (color === 'green') { win = bet * 14; kind = 'yesil'; } }
    else if (/^\d+$/.test(pickArg)) { if (Number(pickArg) === num) { win = bet * 35; kind = 'sayi'; } }
    else return { ok: false, error: 'gecersiz' };
    if (win > 0) this.ctx.economy.add(player, win);
    player.stats[win > 0 ? 'won' : 'lost']++;
    return { ok: true, text: `Rulet: ${num} (${color}). ${win > 0 ? '+' + win + ' (' + kind + ')' : 'kayip -' + bet}` };
  }

  bjDeal() { return Math.floor(Math.random() * 13) + 1; }
  bjValue(hand) {
    let total = 0, aces = 0;
    for (const c of hand) { if (c >= 11) total += 10; else if (c === 1) { total += 11; aces++; } else total += c; }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  }
  bjLabel(c) { return c === 1 ? 'A' : c === 11 ? 'J' : c === 12 ? 'Q' : c === 13 ? 'K' : String(c); }
  blackjack(player, bet) {
    const v = this.validateBet(player, bet); if (!v.ok) return v;
    if (this.bjGames.has(player.key)) return { ok: false, error: 'Zaten oyunda. /hit veya /stand.' };
    this.ctx.economy.remove(player, bet);
    const game = { bet, player: [this.bjDeal(), this.bjDeal()], dealer: [this.bjDeal(), this.bjDeal()] };
    this.bjGames.set(player.key, game);
    return { ok: true, text: `Sen: ${game.player.map(c => this.bjLabel(c)).join(' ')} (${this.bjValue(game.player)})  Dealer: ${this.bjLabel(game.dealer[0])} ?` };
  }
  bjHit(player) {
    const g = this.bjGames.get(player.key); if (!g) return { ok: false, error: 'Aktif blackjack yok.' };
    g.player.push(this.bjDeal());
    const v = this.bjValue(g.player);
    if (v > 21) { this.bjGames.delete(player.key); player.stats.lost++; return { ok: true, text: `Sen: ${g.player.map(c => this.bjLabel(c)).join(' ')} (${v}) BUST! -${g.bet}` }; }
    return { ok: true, text: `Sen: ${g.player.map(c => this.bjLabel(c)).join(' ')} (${v})` };
  }
  bjStand(player) {
    const g = this.bjGames.get(player.key); if (!g) return { ok: false, error: 'Aktif blackjack yok.' };
    while (this.bjValue(g.dealer) < 17) g.dealer.push(this.bjDeal());
    const pv = this.bjValue(g.player), dv = this.bjValue(g.dealer);
    let win = 0, msg;
    if (dv > 21 || pv > dv) { win = g.bet * 2; msg = 'KAZANDIN!'; player.stats.won++; }
    else if (pv === dv) { win = g.bet; msg = 'BERABERE'; }
    else { msg = 'KAYBETTIN'; player.stats.lost++; }
    if (win > 0) this.ctx.economy.add(player, win);
    this.bjGames.delete(player.key);
    return { ok: true, text: `Sen: ${pv}  Dealer: ${dv} -> ${msg}${win > 0 ? ' +' + win : ''}` };
  }

  coinflip(player, side, bet) {
    const v = this.validateBet(player, bet); if (!v.ok) return v;
    const s = (side || '').toLowerCase();
    if (!['h', 't', 'head', 'tail', 'yazi', 'tura'].includes(s)) return { ok: false, error: 'h/t' };
    this.ctx.economy.remove(player, bet);
    const flip = Math.random() < 0.5 ? 'h' : 't';
    const won = (s.startsWith('h') || s === 'yazi') ? flip === 'h' : flip === 't';
    if (won) this.ctx.economy.add(player, bet * 2);
    player.stats[won ? 'won' : 'lost']++;
    return { ok: true, text: `Cikan: ${flip === 'h' ? 'Yazi' : 'Tura'}. ${won ? '+' + bet * 2 : '-' + bet}` };
  }

  dice(player, target, bet) {
    if (!target || target < 1 || target > 6) return { ok: false, error: '1-6 arasi.' };
    const v = this.validateBet(player, bet); if (!v.ok) return v;
    this.ctx.economy.remove(player, bet);
    const r = Math.floor(Math.random() * 6) + 1;
    const won = r === target;
    if (won) this.ctx.economy.add(player, bet * 5);
    player.stats[won ? 'won' : 'lost']++;
    return { ok: true, text: `Zar: ${r}. ${won ? '+' + bet * 5 : '-' + bet}` };
  }
}

module.exports = Casino;
