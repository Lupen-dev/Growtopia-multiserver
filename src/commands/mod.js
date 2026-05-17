// Helper / mod yetkisi gerektiren komutlar
module.exports = [
  {
    name: 'kick', role: 'mod', category: 'moderasyon', desc: 'Oyuncuyu sunucudan at', usage: '/kick <oyuncu> [sebep]',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t || !t.conn) return { ok: false, error: 'Oyuncu cevrimici degil.' };
      const reason = args.slice(1).join(' ') || 'sebep yok';
      ctx.kick && ctx.kick(t, reason);
      ctx.audit.record('kick', player.name, t.name, { reason });
      ctx.chat.system(`${t.name} sunucudan atildi (${reason})`, 'global');
      return { ok: true, text: 'Atildi.' };
    }
  },
  {
    name: 'modmute', aliases: ['mmute'], role: 'mod', category: 'moderasyon',
    desc: 'Oyuncuyu sustur', usage: '/modmute <oyuncu> [dakika] [sebep]',
    handler: ({ player, args, ctx }) => {
      const t = args[0]; if (!t) return { ok: false, error: 'kim?' };
      const mins = Number(args[1] || ctx.config.moderation.muteDefaultMin);
      const reason = args.slice(2).join(' ') || '';
      ctx.bans.mute(t, player.name, reason, mins);
      ctx.audit.record('mute', player.name, t, { mins, reason });
      ctx.chat.system(`${t} ${mins}dk susturuldu.`, 'global');
      return { ok: true, text: 'Susturuldu.' };
    }
  },
  {
    name: 'unmute', role: 'mod', category: 'moderasyon', desc: 'Susturmayi kaldir', usage: '/unmute <oyuncu>',
    handler: ({ player, args, ctx }) => {
      const ok = ctx.bans.unmute(args[0]);
      if (ok) ctx.audit.record('unmute', player.name, args[0]);
      return { ok, text: ok ? 'Acildi.' : 'Susturulmamis.', error: ok ? null : 'Susturulmamis.' };
    }
  },
  {
    name: 'jail', role: 'mod', category: 'moderasyon', desc: 'Oyuncuyu hapse yolla', usage: '/jail <oyuncu> [dakika]',
    handler: ({ player, args, ctx }) => {
      const t = args[0]; if (!t) return { ok: false, error: 'kim?' };
      const mins = Number(args[1] || ctx.config.moderation.jailDefaultMin);
      ctx.bans.jail(t, player.name, args.slice(2).join(' ') || '', mins);
      const tp = ctx.players.get(t);
      if (tp && tp.conn) ctx.worlds.enter(tp, 'JAIL');
      ctx.audit.record('jail', player.name, t, { mins });
      return { ok: true, text: 'Hapse atildi.' };
    }
  },
  {
    name: 'unjail', role: 'mod', category: 'moderasyon', desc: 'Hapsi kaldir', usage: '/unjail <oyuncu>',
    handler: ({ player, args, ctx }) => { ctx.bans.unjail(args[0]); ctx.audit.record('unjail', player.name, args[0]); return { ok: true, text: 'Aciilanildi.' }; }
  },
  {
    name: 'warn', role: 'mod', category: 'moderasyon', desc: 'Oyuncuyu uyar', usage: '/warn <oyuncu> <sebep>',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Oyuncu yok.' };
      t.warns = (t.warns || 0) + 1; ctx.db.mark('players');
      ctx.audit.record('warn', player.name, t.name, { reason: args.slice(1).join(' ') });
      ctx.chat.system(`${t.name} uyarildi (${t.warns}/${ctx.config.moderation.maxWarnsBeforeBan})`, 'global');
      if (t.warns >= ctx.config.moderation.maxWarnsBeforeBan) {
        ctx.bans.ban(t.name, player.name, 'cok fazla uyari', 60 * 24);
        ctx.audit.record('autoban', 'SYSTEM', t.name, { warns: t.warns });
      }
      return { ok: true, text: 'Uyarildi.' };
    }
  },
  {
    name: 'unwarn', role: 'mod', category: 'moderasyon', desc: 'Uyari sayisini sifirla', usage: '/unwarn <oyuncu>',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Yok.' };
      t.warns = 0; ctx.db.mark('players');
      ctx.audit.record('unwarn', player.name, t.name);
      return { ok: true, text: 'Sifirlandi.' };
    }
  },
  {
    name: 'tp', aliases: ['teleport'], role: 'mod', category: 'moderasyon', desc: 'Bir oyuncunun dunyasina isin', usage: '/tp <oyuncu>',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Yok.' };
      ctx.worlds.enter(player, t.world);
      return { ok: true, text: `Isinlandin: ${t.world}` };
    }
  },
  {
    name: 'tphere', aliases: ['summon'], role: 'mod', category: 'moderasyon', desc: 'Oyuncuyu yanina cek', usage: '/tphere <oyuncu>',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t || !t.conn) return { ok: false, error: 'Cevrimici degil.' };
      ctx.worlds.enter(t, player.world);
      ctx.audit.record('tphere', player.name, t.name);
      return { ok: true, text: 'Getirdin: ' + t.name };
    }
  },
  {
    name: 'freeze', role: 'mod', category: 'moderasyon', desc: 'Oyuncuyu dondur', usage: '/freeze <oyuncu>',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Yok.' };
      t.frozen = true; ctx.db.mark('players');
      ctx.audit.record('freeze', player.name, t.name);
      return { ok: true, text: 'Donduruldu.' };
    }
  },
  {
    name: 'unfreeze', role: 'mod', category: 'moderasyon', desc: 'Donmayi kaldir',
    handler: ({ player, args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Yok.' };
      t.frozen = false; ctx.db.mark('players');
      return { ok: true, text: 'Cozuldu.' };
    }
  },
  {
    name: 'announce', aliases: ['duyur'], role: 'mod', category: 'moderasyon', desc: 'Global duyuru', usage: '/announce <metin>',
    handler: ({ player, args, ctx }) => {
      ctx.chat.system('[Duyuru] ' + args.join(' '), 'global');
      ctx.broadcast && ctx.broadcast({ type: 'announce', text: args.join(' '), source: player.name });
      ctx.audit.record('announce', player.name, null, { text: args.join(' ') });
      return { ok: true };
    }
  },
  {
    name: 'clearchat', aliases: ['cc'], role: 'mod', category: 'moderasyon', desc: 'Sohbeti temizle (gorsel)',
    handler: ({ player, ctx }) => {
      ctx.broadcast && ctx.broadcast({ type: 'clearchat', by: player.name });
      ctx.audit.record('clearchat', player.name);
      return { ok: true };
    }
  },
  {
    name: 'history', role: 'mod', category: 'moderasyon', desc: 'Oyuncu denetim gecmisi', usage: '/history <oyuncu>',
    handler: ({ args, ctx }) => {
      const t = args[0]; if (!t) return { ok: false, error: 'kim?' };
      const entries = ctx.audit.recent(500).filter(e => e.target && e.target.toLowerCase() === t.toLowerCase()).slice(0, 20);
      if (!entries.length) return { ok: true, text: 'Gecmis yok.' };
      return { ok: true, text: entries.map(e => `  ${new Date(e.ts).toISOString().slice(0, 19)} ${e.action} by ${e.by}`).join('\n') };
    }
  },
  {
    name: 'modchat', aliases: ['mc'], role: 'mod', category: 'moderasyon', desc: 'Mod sohbeti', usage: '/mc <metin>',
    handler: ({ player, args, ctx }) => {
      ctx.chat.push({ type: 'modchat', player: player.name, role: player.role, text: args.join(' '), scope: 'modchat' });
      return { ok: true };
    }
  },
  {
    name: 'eventstart', role: 'mod', category: 'moderasyon', desc: 'Sunucu olayini baslat', usage: '/eventstart <id>',
    handler: ({ player, args, ctx }) => {
      const ok = ctx.events.start(args[0]);
      if (ok) ctx.audit.record('event.start', player.name, args[0]);
      return { ok, text: ok ? 'Basladi.' : 'Olay yok.' };
    }
  },
  {
    name: 'eventstop', role: 'mod', category: 'moderasyon', desc: 'Olayi durdur',
    handler: ({ player, args, ctx }) => {
      const ok = ctx.events.stop(args[0]);
      if (ok) ctx.audit.record('event.stop', player.name, args[0]);
      return { ok, text: ok ? 'Durdu.' : 'Aktif degil.' };
    }
  },
  {
    name: 'seeinv', aliases: ['inspect'], role: 'mod', category: 'moderasyon', desc: 'Oyuncu envanteri', usage: '/seeinv <oyuncu>',
    handler: ({ args, ctx }) => {
      const t = ctx.players.get(args[0] || ''); if (!t) return { ok: false, error: 'Yok.' };
      const lines = Object.entries(t.inventory).map(([id, q]) => `  [${id}] ${(ctx.items.get(id) || {}).name || '?'} x${q}`);
      return { ok: true, text: `${t.name} envanteri:\n` + (lines.join('\n') || 'bos') };
    }
  }
];
