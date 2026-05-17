// Oyuncu seviyesi komutlar (tum oyuncular kullanabilir).
const Perms = require('../core/Permissions');

function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${d}g ${h}s ${m}d ${sec}sn`;
}

module.exports = [
  {
    name: 'help', aliases: ['?', 'yardim', 'commands', 'komutlar'], category: 'genel',
    desc: 'Tum komutlari listeler', usage: '/help [kategori]',
    handler: ({ player, args, ctx }) => {
      const cats = ctx.cmd.byCategory();
      if (args[0]) {
        const list = cats[args[0]] || [];
        if (!list.length) return { ok: true, text: 'Kategori bulunamadi: ' + args[0] };
        const txt = list.filter(c => !c.hidden && Perms.atLeast(player.role, c.role))
          .map(c => `  /${c.name.padEnd(14)} ${c.desc}`).join('\n');
        return { ok: true, text: `== ${args[0]} ==\n` + txt };
      }
      let out = '== KOMUTLAR ==\n';
      for (const [cat, list] of Object.entries(cats)) {
        const filtered = list.filter(c => !c.hidden && Perms.atLeast(player.role, c.role));
        if (!filtered.length) continue;
        out += `${cat}: ` + filtered.map(c => '/' + c.name).join(', ') + '\n';
      }
      out += '\nDetay icin: /help <kategori>';
      return { ok: true, text: out };
    }
  },
  {
    name: 'who', aliases: ['list', 'online', 'kim'], category: 'genel',
    desc: 'Online oyuncular', usage: '/who',
    handler: ({ ctx }) => {
      const list = ctx.players.online_list().map(p => `${Perms.TAGS[p.role]}${p.name} (@${p.world})`).join('\n');
      return { ok: true, text: `Online (${ctx.players.onlineCount()}):\n` + (list || 'kimse yok') };
    }
  },
  {
    name: 'stats', aliases: ['profile', 'profil', 'me'], category: 'genel',
    desc: 'Kendi istatistiklerin', usage: '/stats [oyuncu]',
    handler: ({ player, args, ctx }) => {
      const target = args[0] ? ctx.players.get(args[0]) : player;
      if (!target) return { ok: false, error: 'Oyuncu bulunamadi.' };
      const xpNext = ctx.players.xpForNext(target);
      return { ok: true, text: [
        `== ${Perms.TAGS[target.role]}${target.name} ==`,
        `Seviye: ${target.level}  XP: ${target.xp}/${xpNext}`,
        `Gems: ${target.gems}  Can: ${target.health}/${target.maxHealth}`,
        `Olum: ${target.stats.deaths}  Kill: ${target.stats.kills}  K/D: ${(target.stats.kills / Math.max(1, target.stats.deaths)).toFixed(2)}`,
        `Balik: ${target.stats.fish}  Madencilik: ${target.stats.mined}  Hasat: ${target.stats.harvested}`,
        `Klan: ${target.clan || '-'}  Unvan: ${target.title || '-'}`
      ].join('\n') };
    }
  },
  {
    name: 'inv', aliases: ['inventory', 'envanter', 'bag'], category: 'genel',
    desc: 'Envanterini gosterir', usage: '/inv',
    handler: ({ player, ctx }) => {
      const lines = Object.entries(player.inventory).map(([id, qty]) => {
        const it = ctx.items.get(id);
        return `  [${id}] ${it ? it.name : 'bilinmiyor'} x${qty} (${it ? it.rarity : '?'})`;
      });
      return { ok: true, text: '== Envanter ==\n' + (lines.join('\n') || 'bos') };
    }
  },
  {
    name: 'balance', aliases: ['bal', 'gems', 'gem', 'para'], category: 'ekonomi',
    desc: 'Gems bakiyeni gosterir', handler: ({ player }) => ({ ok: true, text: `Gems: ${player.gems}` })
  },
  {
    name: 'go', aliases: ['warp', 'world', 'git'], category: 'gezinme',
    desc: 'Bir dunyaya git', usage: '/go <DUNYA>',
    handler: ({ player, args, ctx }) => {
      if (!args[0]) return { ok: false, error: 'kullanim: /go <DUNYA>' };
      const r = ctx.worlds.enter(player, args[0]);
      if (!r.ok) return { ok: false, error: r.error };
      ctx.chat.system(`${player.name} ${r.world.name} dunyasina girdi.`, 'world:' + r.world.name);
      return { ok: true, text: `${r.world.name} dunyasina girildi. (icinde: ${r.world.players.length})` };
    }
  },
  {
    name: 'home', aliases: ['ev'], category: 'gezinme',
    desc: 'Ev olarak ayarladigin dunyaya gider',
    handler: ({ player, ctx }) => ctx.cmd.execute(player, '/go ' + (player.home || 'START'))
  },
  {
    name: 'sethome', category: 'gezinme', desc: 'Su anki dunyayi ev olarak ayarla',
    handler: ({ player, ctx }) => { player.home = player.world; ctx.db.mark('players'); return { ok: true, text: 'Ev ayarlandi: ' + player.world }; }
  },
  {
    name: 'spawn', aliases: ['hub'], category: 'gezinme', desc: 'START dunyasina git',
    handler: ({ player, ctx }) => ctx.cmd.execute(player, '/go START')
  },
  {
    name: 'worlds', aliases: ['dunyalar', 'wlist'], category: 'gezinme',
    desc: 'En cok ziyaret edilen dunyalar',
    handler: ({ ctx }) => ({ ok: true, text: 'En cok ziyaret:\n' + ctx.worlds.topVisited(15).map(w => `  ${w.name.padEnd(20)} z:${w.visits} icinde:${w.players.length}`).join('\n') })
  },
  {
    name: 'create', aliases: ['mkworld'], category: 'gezinme',
    desc: 'Yeni bir dunya olustur (sahip sen olursun)', usage: '/create <ISIM>',
    handler: ({ player, args, ctx }) => {
      if (!args[0]) return { ok: false, error: 'kullanim: /create <ISIM>' };
      const r = ctx.worlds.create(args[0], player.name);
      if (!r.ok) return { ok: false, error: r.error };
      ctx.audit.record('world.create', player.name, r.world.name);
      return { ok: true, text: 'Dunya olusturuldu: ' + r.world.name };
    }
  },
  {
    name: 'lock', category: 'gezinme', desc: 'Sahibi oldugun dunyayi kilitle',
    handler: ({ player, ctx }) => ctx.worlds.lock(player.world, player.name) ? { ok: true, text: 'Kilitlendi.' } : { ok: false, error: 'Yetkin yok.' }
  },
  {
    name: 'unlock', category: 'gezinme', desc: 'Dunya kilidini ac',
    handler: ({ player, ctx }) => ctx.worlds.unlock(player.world, player.name) ? { ok: true, text: 'Kilit acildi.' } : { ok: false, error: 'Yetkin yok.' }
  },
  {
    name: 'msg', aliases: ['pm', 'w', 'whisper', 'tell', 'dm'], category: 'sohbet',
    desc: 'Ozel mesaj gonder', usage: '/msg <oyuncu> <mesaj>',
    handler: ({ player, args, ctx }) => {
      const target = ctx.players.get(args[0] || '');
      if (!target) return { ok: false, error: 'Oyuncu bulunamadi.' };
      const text = args.slice(1).join(' ');
      if (!text) return { ok: false, error: 'Mesaj bos olamaz.' };
      const entry = { type: 'pm', from: player.name, to: target.name, text };
      ctx.chat.push(entry);
      target.lastPmFrom = player.name;
      player.lastPmFrom = target.name;
      return { ok: true, text: `[->${target.name}] ${text}` };
    }
  },
  {
    name: 'reply', aliases: ['r'], category: 'sohbet', desc: 'Son mesaja yanit ver', usage: '/r <mesaj>',
    handler: ({ player, args, ctx }) => {
      if (!player.lastPmFrom) return { ok: false, error: 'Yanit verilecek mesaj yok.' };
      return ctx.cmd.execute(player, '/msg ' + player.lastPmFrom + ' ' + args.join(' '));
    }
  },
  {
    name: 'me', category: 'sohbet', desc: 'Emote (* yapar gibi)', usage: '/me <metin>',
    handler: ({ player, args, ctx }) => {
      const text = args.join(' '); if (!text) return { ok: false, error: 'Metin?' };
      ctx.chat.push({ type: 'emote', player: player.name, text: `* ${player.name} ${text}`, scope: 'world:' + player.world });
      return { ok: true };
    }
  },
  {
    name: 'shout', aliases: ['yell', 'haykir'], category: 'sohbet',
    desc: 'Tum sunucuya bagir (50 gem)', usage: '/shout <metin>',
    handler: ({ player, args, ctx }) => {
      if (!ctx.economy.remove(player, 50)) return { ok: false, error: 'En az 50 gem gerekli.' };
      const text = args.join(' ').slice(0, 200);
      ctx.chat.push({ type: 'shout', player: player.name, text, scope: 'global', role: player.role });
      return { ok: true };
    }
  },
  {
    name: 'mute', category: 'sohbet', desc: 'Yereldeki bir oyuncuyu kendin icin sustur', usage: '/mute <oyuncu>',
    handler: ({ player, args, ctx }) => {
      if (!args[0]) return { ok: false, error: 'kim?' };
      player.blocked = player.blocked || [];
      if (!player.blocked.includes(args[0].toLowerCase())) player.blocked.push(args[0].toLowerCase());
      ctx.db.mark('players');
      return { ok: true, text: args[0] + ' artik sana mesaj atamaz/gozukmez.' };
    }
  },
  {
    name: 'friend', aliases: ['addfriend', 'arkadas'], category: 'sosyal',
    desc: 'Arkadas ekle', usage: '/friend <oyuncu>',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Oyuncu bulunamadi.' };
      if (player.friends.includes(t.key)) return { ok: false, error: 'Zaten arkadasin.' };
      player.friends.push(t.key); ctx.db.mark('players');
      return { ok: true, text: 'Arkadas eklendi: ' + t.name };
    }
  },
  {
    name: 'friends', category: 'sosyal', desc: 'Arkadaslarin', handler: ({ player, ctx }) => {
      if (!player.friends.length) return { ok: true, text: 'Arkadasin yok.' };
      const lines = player.friends.map(k => {
        const f = ctx.players.data.players[k]; if (!f) return null;
        const on = ctx.players.online.has(k) ? '[ON]' : '[OFF]';
        return `  ${on} ${f.name} @${f.world} lvl${f.level}`;
      }).filter(Boolean);
      return { ok: true, text: 'Arkadaslar:\n' + lines.join('\n') };
    }
  },
  {
    name: 'unfriend', aliases: ['removefriend'], category: 'sosyal', desc: 'Arkadasi cikar', usage: '/unfriend <oyuncu>',
    handler: ({ player, args, ctx }) => {
      const k = (args[0] || '').toLowerCase();
      player.friends = player.friends.filter(f => f !== k); ctx.db.mark('players');
      return { ok: true, text: 'Cikarildi.' };
    }
  },
  {
    name: 'daily', aliases: ['gunluk'], category: 'ekonomi',
    desc: 'Gunluk odulunu al',
    handler: ({ player, ctx }) => {
      const r = ctx.economy.daily(player);
      if (!r.ok) return r;
      return { ok: true, text: `Gunluk odul: +${r.reward} gem (streak: ${r.streak}). Yarin tekrar gel!` };
    }
  },
  {
    name: 'vote', aliases: ['oyver'], category: 'ekonomi', desc: 'Sunucuyu oyla, gem kazan',
    handler: ({ player, ctx }) => {
      const now = Date.now();
      if (now - player.lastVote < 12 * 3600 * 1000) return { ok: false, error: '12 saatte bir oy verebilirsin.' };
      player.lastVote = now;
      const reward = ctx.config.economy.voteReward;
      ctx.economy.add(player, reward);
      return { ok: true, text: `Tesekkurler! +${reward} gem kazandin.` };
    }
  },
  {
    name: 'pay', aliases: ['gonder', 'send'], category: 'ekonomi', desc: 'Oyuncuya gem gonder', usage: '/pay <oyuncu> <miktar>',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Oyuncu yok.' };
      const amt = Number(args[1]); if (!amt || amt <= 0) return { ok: false, error: 'Gecersiz miktar.' };
      const r = ctx.economy.transfer(player, t, amt);
      if (!r.ok) return r;
      ctx.audit.record('pay', player.name, t.name, { amt, tax: r.tax });
      return { ok: true, text: `${amt} gem gonderildi (${r.tax} vergi).` };
    }
  },
  {
    name: 'shop', aliases: ['store', 'magaza'], category: 'ekonomi',
    desc: 'Magazadaki esyalari listele', usage: '/shop [kategori]',
    handler: ({ args, ctx }) => {
      const cat = args[0];
      const list = (cat ? ctx.items.byCategory(cat) : ctx.items.list()).slice(0, 30);
      const lines = list.map(i => `  [${i.id}] ${i.name.padEnd(20)} ${i.rarity.padEnd(10)} ${i.value} gem`);
      return { ok: true, text: '== Magaza ==\n' + lines.join('\n') + '\n(/buy <id> [adet])' };
    }
  },
  {
    name: 'buy', aliases: ['satinal'], category: 'ekonomi', desc: 'Magazadan esya al', usage: '/buy <id> [adet]',
    handler: ({ player, args, ctx }) => {
      const item = ctx.items.get(args[0]); if (!item) return { ok: false, error: 'Esya yok.' };
      const qty = Math.max(1, Number(args[1] || 1));
      const cost = item.value * qty;
      if (!ctx.economy.remove(player, cost)) return { ok: false, error: `${cost} gem gerekli.` };
      ctx.players.addItem(player, item.id, qty);
      return { ok: true, text: `${qty}x ${item.name} alindi. (-${cost} gem)` };
    }
  },
  {
    name: 'sell', aliases: ['sat'], category: 'ekonomi', desc: 'Esyani sat (yarim fiyat)', usage: '/sell <id> [adet]',
    handler: ({ player, args, ctx }) => {
      const item = ctx.items.get(args[0]); if (!item) return { ok: false, error: 'Esya yok.' };
      const qty = Math.max(1, Number(args[1] || 1));
      if (!ctx.players.removeItem(player, item.id, qty)) return { ok: false, error: 'Yeterli esyan yok.' };
      const earn = Math.floor(item.value * qty * 0.5);
      ctx.economy.add(player, earn);
      return { ok: true, text: `${qty}x ${item.name} satildi. (+${earn} gem)` };
    }
  },
  {
    name: 'use', aliases: ['kullan'], category: 'oyun', desc: 'Esyayi kullan (yemek, buff, vb.)', usage: '/use <id>',
    handler: ({ player, args, ctx }) => {
      const item = ctx.items.get(args[0]); if (!item) return { ok: false, error: 'Esya yok.' };
      if (!player.inventory[item.id]) return { ok: false, error: 'Bu esya envanterinde yok.' };
      if (item.category === 'food') {
        player.health = Math.min(player.maxHealth, player.health + (item.heal || 10));
        ctx.players.removeItem(player, item.id);
        return { ok: true, text: `${item.name} yendi. Can: ${player.health}` };
      }
      if (item.category === 'buff') {
        ctx.players.removeItem(player, item.id);
        player.buffs = player.buffs || {};
        player.buffs[item.name] = Date.now() + 10 * 60 * 1000;
        return { ok: true, text: `${item.name} aktif! 10 dakika.` };
      }
      if (item.category === 'wearable') {
        player.equipped[item.slot] = item.id;
        ctx.db.mark('players');
        return { ok: true, text: `${item.name} kusandin.` };
      }
      return { ok: false, error: 'Bu esya kullanilamaz.' };
    }
  },
  {
    name: 'top', aliases: ['leaderboard', 'siralama'], category: 'genel', desc: 'En zenginler/en yuksek seviyeler',
    handler: ({ args, ctx }) => {
      const kind = args[0] || 'gems';
      const all = ctx.players.all();
      let sorted;
      if (kind === 'level') sorted = all.sort((a, b) => b.level - a.level);
      else if (kind === 'kills') sorted = all.sort((a, b) => b.stats.kills - a.stats.kills);
      else if (kind === 'fish') sorted = all.sort((a, b) => b.stats.fish - a.stats.fish);
      else sorted = all.sort((a, b) => b.gems - a.gems);
      const top = sorted.slice(0, 10).map((p, i) => `  ${(i + 1).toString().padStart(2)}. ${p.name.padEnd(20)} ${kind === 'gems' ? p.gems + 'g' : kind === 'level' ? 'lvl' + p.level : kind === 'kills' ? p.stats.kills + ' kill' : p.stats.fish + ' balik'}`).join('\n');
      return { ok: true, text: `== Top 10 (${kind}) ==\n` + top + '\n(gems|level|kills|fish)' };
    }
  },
  {
    name: 'title', aliases: ['unvan'], category: 'oyun', desc: 'Unvanini ayarla (200 gem)', usage: '/title <metin>',
    handler: ({ player, args, ctx }) => {
      const t = args.join(' ').slice(0, 24); if (!t) return { ok: false, error: 'Bos olamaz.' };
      if (!ctx.economy.remove(player, 200)) return { ok: false, error: '200 gem gerekli.' };
      player.title = t; ctx.db.mark('players');
      return { ok: true, text: 'Unvan ayarlandi: ' + t };
    }
  },
  {
    name: 'serverinfo', aliases: ['info', 'sinfo'], category: 'genel', desc: 'Sunucu bilgileri',
    handler: ({ ctx }) => ({
      ok: true, text: [
        `== ${ctx.config.server.name} ==`,
        ctx.config.server.motd,
        `Online: ${ctx.players.onlineCount()}/${ctx.config.server.maxPlayers}`,
        `Toplam oyuncu: ${ctx.players.count()}  Dunya: ${ctx.worlds.count()}`,
        `Uptime: ${fmtTime(Date.now() - ctx.startedAt)}`,
        `Aktif olaylar: ${ctx.events.listActive().map(e => e.name).join(', ') || 'yok'}`
      ].join('\n')
    })
  },
  {
    name: 'motd', category: 'genel', desc: 'Bugunun mesaji', handler: ({ ctx }) => ({ ok: true, text: ctx.config.server.motd })
  },
  {
    name: 'time', aliases: ['saat'], category: 'genel', desc: 'Sunucu saati', handler: () => ({ ok: true, text: 'Sunucu saati: ' + new Date().toLocaleString('tr-TR') })
  },
  {
    name: 'uptime', category: 'genel', desc: 'Sunucu calisma suresi', handler: ({ ctx }) => ({ ok: true, text: 'Uptime: ' + fmtTime(Date.now() - ctx.startedAt) })
  },
  {
    name: 'ping', category: 'genel', desc: 'Sunucu yaniti', handler: () => ({ ok: true, text: 'pong! ' + Date.now() })
  },
  {
    name: 'rules', aliases: ['kurallar'], category: 'genel', desc: 'Sunucu kurallari',
    handler: () => ({ ok: true, text: [
      '== KURALLAR ==',
      '1. Hakaret/kufur yok.',
      '2. Cheat/exploit yok.',
      '3. Reklam/spam yok.',
      '4. Adil oyun, dolandiricilik yok.',
      '5. Modlara saygili ol. /report ile bildir.'
    ].join('\n') })
  },
  {
    name: 'report', aliases: ['bildir'], category: 'genel', desc: 'Bir oyuncuyu bildir', usage: '/report <oyuncu> <sebep>',
    handler: ({ player, args, ctx }) => {
      const t = args[0]; const reason = args.slice(1).join(' ');
      if (!t || !reason) return { ok: false, error: 'kullanim: /report <oyuncu> <sebep>' };
      ctx.audit.record('report', player.name, t, { reason });
      ctx.broadcastToMods && ctx.broadcastToMods({ type: 'report', by: player.name, target: t, reason });
      return { ok: true, text: 'Bildirildi. Tesekkurler.' };
    }
  },
  {
    name: 'badges', aliases: ['rozetler', 'achievements'], category: 'oyun', desc: 'Rozetlerin',
    handler: ({ player }) => ({ ok: true, text: 'Rozetler:\n' + (player.badges.length ? player.badges.map(b => '  - ' + b).join('\n') : 'henuz yok') })
  }
];
