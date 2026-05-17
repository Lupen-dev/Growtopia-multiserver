// Eglence / aktivite giris komutlari. Asil mantik src/activities altinda.
module.exports = [
  {
    name: 'fish', aliases: ['balik'], category: 'aktivite',
    desc: 'Balik tut (cooldown var)', handler: ({ player, ctx }) => ctx.activities.get('fishing').cast(player)
  },
  {
    name: 'mine', aliases: ['kaz', 'mining'], category: 'aktivite',
    desc: 'Maden kaz', handler: ({ player, ctx }) => ctx.activities.get('mining').dig(player)
  },
  {
    name: 'farm', aliases: ['ek', 'plant'], category: 'aktivite',
    desc: 'Tarla ek/hasat yap', usage: '/farm plant|harvest',
    handler: ({ player, args, ctx }) => {
      const m = ctx.activities.get('farming');
      if (args[0] === 'plant') return m.plant(player);
      if (args[0] === 'harvest' || args[0] === 'hasat') return m.harvest(player);
      return m.status(player);
    }
  },
  {
    name: 'casino', aliases: ['kumar'], category: 'aktivite',
    desc: 'Kumarhane menusu', handler: ({ ctx }) => ({ ok: true, text: ctx.activities.get('casino').menu() })
  },
  {
    name: 'slots', aliases: ['slot', 'jackpot'], category: 'aktivite',
    desc: 'Slot makinasi cevir', usage: '/slots <bahis>',
    handler: ({ player, args, ctx }) => ctx.activities.get('casino').slots(player, Number(args[0] || 10))
  },
  {
    name: 'roulette', aliases: ['rulet'], category: 'aktivite',
    desc: 'Rulet (red/black/green/sayi)', usage: '/roulette <renk|sayi> <bahis>',
    handler: ({ player, args, ctx }) => ctx.activities.get('casino').roulette(player, args[0], Number(args[1] || 10))
  },
  {
    name: 'blackjack', aliases: ['bj', '21'], category: 'aktivite',
    desc: '21 (Blackjack). /bj <bahis> sonra /hit /stand', usage: '/bj <bahis>',
    handler: ({ player, args, ctx }) => ctx.activities.get('casino').blackjack(player, Number(args[0] || 50))
  },
  {
    name: 'hit', category: 'aktivite', desc: 'Blackjack: kart al', handler: ({ player, ctx }) => ctx.activities.get('casino').bjHit(player)
  },
  {
    name: 'stand', category: 'aktivite', desc: 'Blackjack: dur', handler: ({ player, ctx }) => ctx.activities.get('casino').bjStand(player)
  },
  {
    name: 'coinflip', aliases: ['cf', 'yazitura'], category: 'aktivite',
    desc: 'Yazi/Tura', usage: '/cf <head|tail> <bahis>',
    handler: ({ player, args, ctx }) => ctx.activities.get('casino').coinflip(player, args[0], Number(args[1] || 50))
  },
  {
    name: 'dice', aliases: ['zar'], category: 'aktivite',
    desc: 'Zar at (1-6, hedefi bil 5x)', usage: '/dice <1-6> <bahis>',
    handler: ({ player, args, ctx }) => ctx.activities.get('casino').dice(player, Number(args[0]), Number(args[1] || 25))
  },
  {
    name: 'lottery', aliases: ['piyango'], category: 'aktivite',
    desc: 'Piyango bileti al', usage: '/lottery [adet]',
    handler: ({ player, args, ctx }) => ctx.activities.get('lottery').buy(player, Number(args[0] || 1))
  },
  {
    name: 'pot', aliases: ['jackpot-status', 'pottum'], category: 'aktivite',
    desc: 'Piyango havuzu durumu', handler: ({ ctx }) => ctx.activities.get('lottery').status()
  },
  {
    name: 'quiz', aliases: ['bilgi'], category: 'aktivite',
    desc: 'Bilgi yarismasi cevabi', usage: '/quiz <cevap>',
    handler: ({ player, args, ctx }) => ctx.activities.get('quiz').answer(player, args.join(' '))
  },
  {
    name: 'parkour', aliases: ['pk'], category: 'aktivite',
    desc: 'Parkur etkinligine katil', handler: ({ player, ctx }) => ctx.activities.get('parkour').join(player)
  },
  {
    name: 'pvp', aliases: ['duel', 'duello'], category: 'aktivite',
    desc: 'Oyuncuyu duelloya cagir', usage: '/pvp <oyuncu> [bahis]',
    handler: ({ player, args, ctx }) => ctx.activities.get('pvp').challenge(player, args[0], Number(args[1] || 0))
  },
  {
    name: 'accept', aliases: ['kabul'], category: 'aktivite',
    desc: 'Duello davetini kabul et', handler: ({ player, ctx }) => ctx.activities.get('pvp').accept(player)
  },
  {
    name: 'attack', aliases: ['hit-pvp', 'vur'], category: 'aktivite',
    desc: 'PvP sirasinda saldir', handler: ({ player, ctx }) => ctx.activities.get('pvp').attack(player)
  },
  {
    name: 'flee', aliases: ['kac'], category: 'aktivite',
    desc: 'PvP duellosundan kac', handler: ({ player, ctx }) => ctx.activities.get('pvp').flee(player)
  },
  {
    name: 'treasure', aliases: ['hazine', 'th'], category: 'aktivite',
    desc: 'Hazine avina basla', handler: ({ player, ctx }) => ctx.activities.get('treasure').start(player)
  },
  {
    name: 'dig', aliases: ['ara'], category: 'aktivite',
    desc: 'Hazine avi: kaz', usage: '/dig <x> <y>',
    handler: ({ player, args, ctx }) => ctx.activities.get('treasure').dig(player, Number(args[0]), Number(args[1])) },
  {
    name: 'boss', aliases: ['raid'], category: 'aktivite',
    desc: 'Boss raidine katil/durum', usage: '/boss [hit]',
    handler: ({ player, args, ctx }) => {
      const b = ctx.activities.get('bossraid');
      if (args[0] === 'hit' || args[0] === 'vur') return b.hit(player);
      return b.status(player);
    }
  },
  {
    name: 'event', aliases: ['olaylar'], category: 'aktivite',
    desc: 'Aktif sunucu olaylari',
    handler: ({ ctx }) => {
      const list = ctx.events.listActive();
      if (!list.length) return { ok: true, text: 'Su an aktif olay yok.' };
      return { ok: true, text: 'Aktif olaylar:\n' + list.map(e => `  - ${e.name} (${Math.ceil(e.remaining / 60000)}dk)`).join('\n') };
    }
  },
  {
    name: 'dance', aliases: ['dans'], category: 'eglence',
    desc: 'Dans et!', handler: ({ player, ctx }) => {
      ctx.chat.push({ type: 'emote', player: player.name, text: `* ${player.name} dans ediyor!`, scope: 'world:' + player.world });
      return { ok: true };
    }
  },
  {
    name: 'wave', aliases: ['selam'], category: 'eglence',
    desc: 'Selam ver', handler: ({ player, ctx }) => {
      ctx.chat.push({ type: 'emote', player: player.name, text: `* ${player.name} herkese selam veriyor!`, scope: 'world:' + player.world });
      return { ok: true };
    }
  },
  {
    name: 'laugh', aliases: ['gul'], category: 'eglence',
    desc: 'Gul', handler: ({ player, ctx }) => {
      ctx.chat.push({ type: 'emote', player: player.name, text: `* ${player.name} kahkahalarla guluyor!`, scope: 'world:' + player.world });
      return { ok: true };
    }
  },
  {
    name: 'cry', aliases: ['agla'], category: 'eglence',
    desc: 'Agla', handler: ({ player, ctx }) => {
      ctx.chat.push({ type: 'emote', player: player.name, text: `* ${player.name} agliyor...`, scope: 'world:' + player.world });
      return { ok: true };
    }
  },
  {
    name: 'flex', aliases: ['gosteris'], category: 'eglence',
    desc: 'Envanterindeki en degerli esyayi sergile',
    handler: ({ player, ctx }) => {
      let best = null;
      for (const id of Object.keys(player.inventory)) {
        const it = ctx.items.get(id);
        if (!it) continue;
        if (!best || it.value > best.value) best = it;
      }
      if (!best) return { ok: false, error: 'Sergileyecek bir sey yok.' };
      ctx.chat.push({ type: 'flex', player: player.name, text: `* ${player.name} ${best.name} sergiliyor! (${best.rarity})`, scope: 'global' });
      return { ok: true };
    }
  },
  {
    name: '8ball', aliases: ['8', 'sihirli'], category: 'eglence',
    desc: 'Sihirli 8 topu', usage: '/8ball <soru>',
    handler: ({ player, args, ctx }) => {
      const answers = [
        'Kesinlikle evet.', 'Pek sanmiyorum.', 'Belki, belki degil.', 'Yildizlar evet diyor!',
        'Sansli gunundesin.', 'Asla.', 'Daha sonra tekrar dene.', 'Sonuc belirsiz.',
        'Olabilir...', 'Hayir, hayir, hayir.'
      ];
      const ans = answers[Math.floor(Math.random() * answers.length)];
      ctx.chat.push({ type: 'system', text: `[8ball] ${player.name}: "${args.join(' ')}" -> ${ans}`, scope: 'world:' + player.world });
      return { ok: true };
    }
  },
  {
    name: 'rps', aliases: ['tas'], category: 'eglence',
    desc: 'Tas-Kagit-Makas (bot)', usage: '/rps <tas|kagit|makas>',
    handler: ({ player, args, ctx }) => {
      const opts = ['tas', 'kagit', 'makas'];
      const me = args[0]; if (!opts.includes(me)) return { ok: false, error: 'tas|kagit|makas' };
      const bot = opts[Math.floor(Math.random() * 3)];
      let result;
      if (me === bot) result = 'berabere';
      else if ((me === 'tas' && bot === 'makas') || (me === 'kagit' && bot === 'tas') || (me === 'makas' && bot === 'kagit')) {
        result = 'kazandin'; ctx.economy.add(player, 25);
      } else { result = 'kaybettin'; ctx.economy.remove(player, 10); }
      return { ok: true, text: `Sen: ${me}  Bot: ${bot}  Sonuc: ${result}` };
    }
  },
  {
    name: 'spin', aliases: ['cark'], category: 'eglence',
    desc: 'Sans carkini cevir (gunde 1 kez)',
    handler: ({ player, ctx }) => {
      const now = Date.now();
      if (player.lastSpin && now - player.lastSpin < 22 * 3600 * 1000) {
        const left = Math.ceil((22 * 3600 * 1000 - (now - player.lastSpin)) / 3600000);
        return { ok: false, error: `${left} saat sonra tekrar cevirebilirsin.` };
      }
      player.lastSpin = now;
      const wheel = [
        { type: 'gems', amt: 100, weight: 30 },
        { type: 'gems', amt: 500, weight: 20 },
        { type: 'gems', amt: 2500, weight: 5 },
        { type: 'gems', amt: 10000, weight: 1 },
        { type: 'xp', amt: 250, weight: 25 },
        { type: 'item', rarity: 'rare', weight: 10 },
        { type: 'item', rarity: 'epic', weight: 3 },
        { type: 'jackpot', weight: 1 }
      ];
      const total = wheel.reduce((a, b) => a + b.weight, 0);
      let r = Math.random() * total, prize;
      for (const w of wheel) { r -= w.weight; if (r <= 0) { prize = w; break; } }
      let text;
      if (prize.type === 'gems') { ctx.economy.add(player, prize.amt); text = `Carkta: +${prize.amt} gem!`; }
      else if (prize.type === 'xp') { ctx.players.addXp(player, prize.amt); text = `Carkta: +${prize.amt} XP!`; }
      else if (prize.type === 'item') {
        const it = ctx.items.randomByRarity(prize.rarity);
        ctx.players.addItem(player, it.id);
        text = `Carkta: ${it.name} (${it.rarity})!`;
      } else if (prize.type === 'jackpot') {
        ctx.economy.add(player, 50000); text = 'JACKPOT! +50,000 gem!';
        ctx.chat.system(`* ${player.name} JACKPOT kazandi!`, 'global');
      }
      ctx.db.mark('players');
      return { ok: true, text };
    }
  },
  {
    name: 'mystery', aliases: ['kutu', 'box'], category: 'eglence',
    desc: 'Gizemli kutu ac (Mystery Box gerekli, id:101)',
    handler: ({ player, ctx }) => {
      if (!ctx.players.removeItem(player, 101, 1)) return { ok: false, error: 'Mystery Box yok (id:101). Magazadan al!' };
      const it = ctx.items.weightedRandom();
      ctx.players.addItem(player, it.id);
      const tier = ctx.items.tier(it.rarity);
      if (it.rarity === 'legendary' || it.rarity === 'epic') ctx.chat.system(`* ${player.name} kutudan ${it.name} (${it.rarity}) cikardi!`, 'global');
      return { ok: true, text: `Kutudan cikan: ${it.name} (${it.rarity}, deger ${it.value})` };
    }
  },
  {
    name: 'roll', aliases: ['salla'], category: 'eglence', desc: 'Rastgele 1-100',
    handler: ({ player, ctx }) => {
      const n = Math.floor(Math.random() * 100) + 1;
      ctx.chat.push({ type: 'system', text: `* ${player.name} salladi: ${n}`, scope: 'world:' + player.world });
      return { ok: true };
    }
  },
  {
    name: 'pet', aliases: ['evcil'], category: 'oyun', desc: 'Evcillerin', handler: ({ player, ctx }) => {
      const pets = Object.entries(player.inventory).filter(([id]) => (ctx.items.get(id) || {}).category === 'pet');
      if (!pets.length) return { ok: true, text: 'Hic evcilin yok. Magazadan al!' };
      return { ok: true, text: 'Evcillerin:\n' + pets.map(([id, q]) => '  - ' + ctx.items.get(id).name + ' x' + q).join('\n') };
    }
  },
  {
    name: 'clan', category: 'sosyal', desc: 'Klan komutlari', usage: '/clan <create|join|leave|info> [isim]',
    handler: ({ player, args, ctx }) => {
      const cl = args[0] || 'info';
      const clans = ctx.db.get('clans') || ctx.db.load('clans', { clans: {} });
      if (cl === 'create') {
        const name = args[1];
        if (!name || !/^[A-Z0-9]{2,12}$/.test(name)) return { ok: false, error: '2-12 buyuk harf/rakam.' };
        if (clans.clans[name]) return { ok: false, error: 'Klan zaten var.' };
        if (!ctx.economy.remove(player, 5000)) return { ok: false, error: '5000 gem gerekli.' };
        clans.clans[name] = { leader: player.name, members: [player.name], gems: 0, createdAt: Date.now() };
        player.clan = name; ctx.db.mark('clans'); ctx.db.mark('players');
        return { ok: true, text: 'Klan kuruldu: ' + name };
      }
      if (cl === 'join') {
        const name = args[1]; const c = clans.clans[name];
        if (!c) return { ok: false, error: 'Klan yok.' };
        if (c.members.length >= 20) return { ok: false, error: 'Klan dolu.' };
        c.members.push(player.name); player.clan = name; ctx.db.mark('clans'); ctx.db.mark('players');
        return { ok: true, text: 'Klana katildin: ' + name };
      }
      if (cl === 'leave') {
        if (!player.clan) return { ok: false, error: 'Klanin yok.' };
        const c = clans.clans[player.clan];
        if (c) c.members = c.members.filter(m => m !== player.name);
        player.clan = null; ctx.db.mark('clans'); ctx.db.mark('players');
        return { ok: true, text: 'Klandan ayrildin.' };
      }
      if (!player.clan) return { ok: true, text: 'Henuz klanin yok. /clan create <ISIM>' };
      const c = clans.clans[player.clan];
      return { ok: true, text: `Klan: ${player.clan}\nLider: ${c.leader}\nUyeler: ${c.members.join(', ')}` };
    }
  }
];
