// Admin / owner komutlari
const Perms = require('../core/Permissions');

module.exports = [
  {
    name: 'ban', role: 'admin', category: 'admin', desc: 'Oyuncuyu yasakla', usage: '/ban <oyuncu> [dakika] [sebep]',
    handler: ({ player, args, ctx }) => {
      const t = args[0]; if (!t) return { ok: false, error: 'kim?' };
      const mins = args[1] ? Number(args[1]) : null;
      const reason = args.slice(2).join(' ') || '';
      ctx.bans.ban(t, player.name, reason, mins);
      ctx.audit.record('ban', player.name, t, { mins, reason });
      ctx.chat.system(`${t} yasaklandi${mins ? ' ' + mins + 'dk' : ' (kalici)'}`, 'global');
      const tp = ctx.players.get(t);
      if (tp && tp.conn) ctx.kick && ctx.kick(tp, 'banlandin: ' + reason);
      return { ok: true, text: 'Yasaklandi.' };
    }
  },
  {
    name: 'unban', role: 'admin', category: 'admin', desc: 'Yasagi kaldir', usage: '/unban <oyuncu>',
    handler: ({ player, args, ctx }) => {
      const ok = ctx.bans.unban(args[0]);
      if (ok) ctx.audit.record('unban', player.name, args[0]);
      return { ok, text: ok ? 'Yasak kaldirildi.' : 'Yasakli degil.', error: ok ? null : 'Yasakli degil.' };
    }
  },
  {
    name: 'promote', role: 'admin', category: 'admin', desc: 'Oyuncuya rol ver', usage: '/promote <oyuncu> <rol>',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Yok.' };
      const role = args[1];
      if (!Perms.ROLES.includes(role)) return { ok: false, error: 'Roller: ' + Perms.ROLES.join(', ') };
      if (Perms.rank(role) >= Perms.rank(player.role) && player.role !== 'owner') return { ok: false, error: 'Kendi seviyenin uzerine atayamazsin.' };
      ctx.players.setRole(t, role);
      ctx.audit.record('promote', player.name, t.name, { role });
      ctx.chat.system(`${t.name} -> ${role}!`, 'global');
      return { ok: true, text: 'Rol ayarlandi.' };
    }
  },
  {
    name: 'demote', role: 'admin', category: 'admin', desc: 'Oyuncuyu player yap', usage: '/demote <oyuncu>',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Yok.' };
      ctx.players.setRole(t, 'player'); ctx.audit.record('demote', player.name, t.name);
      return { ok: true, text: 'Player yapildi.' };
    }
  },
  {
    name: 'give', role: 'admin', category: 'admin', desc: 'Oyuncuya esya ver', usage: '/give <oyuncu> <id> [adet]',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Yok.' };
      const it = ctx.items.get(args[1]); if (!it) return { ok: false, error: 'Esya yok.' };
      const q = Math.max(1, Number(args[2] || 1));
      ctx.players.addItem(t, it.id, q);
      ctx.audit.record('give', player.name, t.name, { item: it.name, qty: q });
      return { ok: true, text: `${q}x ${it.name} verildi.` };
    }
  },
  {
    name: 'take', role: 'admin', category: 'admin', desc: 'Oyuncudan esya al', usage: '/take <oyuncu> <id> [adet]',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Yok.' };
      const ok = ctx.players.removeItem(t, Number(args[1]), Number(args[2] || 1));
      if (ok) ctx.audit.record('take', player.name, t.name, { item: args[1], qty: args[2] });
      return { ok, text: ok ? 'Alindi.' : null, error: ok ? null : 'Yetersiz.' };
    }
  },
  {
    name: 'setgems', role: 'admin', category: 'admin', desc: 'Gem miktari ayarla', usage: '/setgems <oyuncu> <miktar>',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Yok.' };
      t.gems = Math.max(0, Number(args[1])); ctx.db.mark('players');
      ctx.audit.record('setgems', player.name, t.name, { amt: t.gems });
      return { ok: true, text: 'Ayarlandi: ' + t.gems };
    }
  },
  {
    name: 'addgems', role: 'admin', category: 'admin', desc: 'Gem ekle', usage: '/addgems <oyuncu> <miktar>',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Yok.' };
      ctx.economy.add(t, Number(args[1]));
      ctx.audit.record('addgems', player.name, t.name, { amt: args[1] });
      return { ok: true, text: 'Eklendi.' };
    }
  },
  {
    name: 'setlevel', role: 'admin', category: 'admin', desc: 'Seviye ayarla', usage: '/setlevel <oyuncu> <seviye>',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Yok.' };
      t.level = Math.max(1, Number(args[1])); t.xp = 0; ctx.db.mark('players');
      ctx.audit.record('setlevel', player.name, t.name, { lvl: t.level });
      return { ok: true, text: 'Ayarlandi.' };
    }
  },
  {
    name: 'globalmsg', aliases: ['gm', 'broadcast'], role: 'admin', category: 'admin', desc: 'Buyuk duyuru', usage: '/gm <metin>',
    handler: ({ player, args, ctx }) => {
      const text = args.join(' ');
      ctx.chat.system('=====\n' + text + '\n=====', 'global');
      ctx.broadcast && ctx.broadcast({ type: 'bigannounce', text, source: player.name });
      ctx.audit.record('globalmsg', player.name, null, { text });
      return { ok: true };
    }
  },
  {
    name: 'maintenance', role: 'admin', category: 'admin', desc: 'Bakim modu ac/kapat', usage: '/maintenance on|off',
    handler: ({ player, args, ctx }) => {
      ctx.maintenance = args[0] === 'on';
      ctx.audit.record('maintenance', player.name, null, { state: ctx.maintenance });
      ctx.chat.system(ctx.maintenance ? '* SUNUCU BAKIMDA' : '* BAKIM BITTI', 'global');
      return { ok: true, text: 'Bakim modu: ' + (ctx.maintenance ? 'AC' : 'KAPALI') };
    }
  },
  {
    name: 'save', role: 'admin', category: 'admin', desc: 'Veritabanini hemen kaydet',
    handler: ({ player, ctx }) => { ctx.db.saveAll(true); ctx.audit.record('save', player.name); return { ok: true, text: 'Kaydedildi.' }; }
  },
  {
    name: 'reload', role: 'admin', category: 'admin', desc: 'Konfig dosyasini yenile',
    handler: ({ player, ctx }) => { ctx.reloadConfig && ctx.reloadConfig(); ctx.audit.record('reload', player.name); return { ok: true, text: 'Yuklendi.' }; }
  },
  {
    name: 'restart', role: 'owner', category: 'admin', desc: 'Sunucuyu yeniden baslat (process exit, supervisor)',
    handler: ({ player, ctx }) => {
      ctx.audit.record('restart', player.name);
      ctx.chat.system('* Sunucu 5 saniye icinde yeniden baslayacak!', 'global');
      setTimeout(() => ctx.shutdown && ctx.shutdown(true), 5000);
      return { ok: true };
    }
  },
  {
    name: 'shutdown', role: 'owner', category: 'admin', desc: 'Sunucuyu kapat',
    handler: ({ player, ctx }) => {
      ctx.audit.record('shutdown', player.name);
      ctx.chat.system('* Sunucu kapaniyor.', 'global');
      setTimeout(() => ctx.shutdown && ctx.shutdown(false), 2000);
      return { ok: true };
    }
  },
  {
    name: 'spawnboss', role: 'admin', category: 'admin', desc: 'Boss raidi baslat',
    handler: ({ player, ctx }) => {
      ctx.activities.get('bossraid').start();
      ctx.audit.record('spawnboss', player.name);
      return { ok: true, text: 'Boss spawnlandi.' };
    }
  },
  {
    name: 'startquiz', role: 'admin', category: 'admin', desc: 'Quizi manuel baslat',
    handler: ({ player, ctx }) => { ctx.activities.get('quiz').start(); ctx.audit.record('startquiz', player.name); return { ok: true }; }
  },
  {
    name: 'drawlottery', role: 'admin', category: 'admin', desc: 'Piyangoyu hemen cek',
    handler: ({ player, ctx }) => { ctx.activities.get('lottery').draw(); ctx.audit.record('drawlottery', player.name); return { ok: true }; }
  },
  {
    name: 'createworld', role: 'admin', category: 'admin', desc: 'Sistem dunyasi olustur', usage: '/createworld <ISIM>',
    handler: ({ player, args, ctx }) => {
      const r = ctx.worlds.create(args[0], 'SYSTEM');
      if (!r.ok) return r;
      ctx.audit.record('worldcreate', player.name, r.world.name);
      return { ok: true, text: 'Olusturuldu.' };
    }
  },
  {
    name: 'delworld', role: 'admin', category: 'admin', desc: 'Dunyayi sil', usage: '/delworld <ISIM>',
    handler: ({ player, args, ctx }) => {
      const ok = ctx.worlds.remove(args[0]);
      if (ok) ctx.audit.record('worlddel', player.name, args[0]);
      return { ok, text: ok ? 'Silindi.' : null, error: ok ? null : 'Dunya yok.' };
    }
  },
  {
    name: 'resetplayer', role: 'admin', category: 'admin', desc: 'Oyuncuyu sifirla (gem/inv/lvl)', usage: '/resetplayer <oyuncu>',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Yok.' };
      t.gems = 0; t.level = 1; t.xp = 0; t.inventory = {}; t.equipped = {}; t.health = 100;
      t.stats = { kills: 0, deaths: 0, fish: 0, mined: 0, harvested: 0, won: 0, lost: 0, playtimeSec: 0 };
      ctx.db.mark('players');
      ctx.audit.record('resetplayer', player.name, t.name);
      return { ok: true, text: 'Sifirlandi.' };
    }
  },
  {
    name: 'sudo', role: 'owner', category: 'admin', desc: 'Oyuncu adina komut calistir', usage: '/sudo <oyuncu> <komut>',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Yok.' };
      ctx.audit.record('sudo', player.name, t.name, { cmd: args.slice(1).join(' ') });
      return ctx.cmd.execute(t, '/' + args.slice(1).join(' '));
    }
  },
  {
    name: 'op', role: 'owner', category: 'admin', desc: 'Owner yetkisi ver', usage: '/op <oyuncu>',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Yok.' };
      ctx.players.setRole(t, 'owner'); ctx.audit.record('op', player.name, t.name);
      return { ok: true, text: 'Owner yapildi.' };
    }
  },
  {
    name: 'logs', role: 'admin', category: 'admin', desc: 'Son denetim kayitlari', usage: '/logs [adet]',
    handler: ({ args, ctx }) => {
      const n = Math.min(50, Number(args[0] || 20));
      const lines = ctx.audit.recent(n).map(e => `  ${new Date(e.ts).toISOString().slice(11, 19)} ${e.action} ${e.by}${e.target ? ' -> ' + e.target : ''}`);
      return { ok: true, text: lines.join('\n') || 'bos' };
    }
  },
  {
    name: 'stats-server', aliases: ['srvstats'], role: 'admin', category: 'admin', desc: 'Sunucu kaynak/istatistik',
    handler: ({ ctx }) => {
      const mem = process.memoryUsage();
      return { ok: true, text: [
        `RSS: ${(mem.rss / 1024 / 1024).toFixed(1)} MB  Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`,
        `Online: ${ctx.players.onlineCount()}  Toplam: ${ctx.players.count()}  Dunya: ${ctx.worlds.count()}`,
        `Mesaj loglari: ${ctx.chat.data.messages.length}  Audit: ${ctx.audit.data.entries.length}`
      ].join('\n') };
    }
  }
];
