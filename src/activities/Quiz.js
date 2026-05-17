// Bilgi yarismasi - global. Cevap veren ilk kisi kazanir.
const QUESTIONS = [
  { q: 'Turkiyenin baskenti?', a: ['ankara'] },
  { q: 'Gunes Sisteminin en buyuk gezegeni?', a: ['jupiter', 'jupiter\'i'] },
  { q: 'Yer kabugunun en bol elementi?', a: ['oksijen'] },
  { q: 'Bir dakikada kac saniye var?', a: ['60'] },
  { q: 'JavaScript icat eden kisi?', a: ['brendan eich', 'eich'] },
  { q: 'Insanin dna baz cifti sayisi (yaklasik milyar)?', a: ['3'] },
  { q: 'Periyodik tablonun ilk elementi?', a: ['hidrojen', 'h'] },
  { q: '7 x 8?', a: ['56'] },
  { q: 'Ay\'a inen ilk insan?', a: ['neil armstrong', 'armstrong'] },
  { q: 'En uzun nehir?', a: ['nil', 'nile'] },
  { q: 'Mona Lisa\'yi yapan ressam?', a: ['da vinci', 'leonardo da vinci'] },
  { q: 'Sicakligi olcen alet?', a: ['termometre'] },
  { q: 'Turk lirasi sembolu?', a: ['try', 'tl'] },
  { q: 'Bir futbol takiminda sahada kac oyuncu var?', a: ['11'] },
  { q: 'En kucuk asal sayi?', a: ['2'] }
];

class Quiz {
  init(ctx) { this.ctx = ctx; this.active = null; }

  start() {
    if (this.active) return false;
    const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    this.active = { q: q.q, a: q.a.map(x => x.toLowerCase()), startedAt: Date.now(), prize: 1500 };
    this.ctx.chat.system(`* QUIZ! ${q.q} (1500g) - /quiz <cevap>`, 'global');
    this.timeout = setTimeout(() => {
      if (this.active) {
        this.ctx.chat.system(`* Quiz sona erdi. Cevap: ${q.a[0]}`, 'global');
        this.active = null;
      }
    }, 60 * 1000);
    return true;
  }

  answer(player, ans) {
    if (!this.active) return { ok: false, error: 'Aktif quiz yok.' };
    const a = (ans || '').toLowerCase().trim();
    if (this.active.a.includes(a)) {
      clearTimeout(this.timeout);
      this.ctx.economy.add(player, this.active.prize);
      this.ctx.players.addXp(player, 100);
      this.ctx.chat.system(`* ${player.name} quizi bildi! +${this.active.prize}g`, 'global');
      this.active = null;
      return { ok: true, text: 'DOGRU! Odul alindi.' };
    }
    return { ok: false, error: 'Yanlis.' };
  }
}
module.exports = Quiz;
