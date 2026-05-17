const readline = require('readline');
const Logger = require('./Logger');
const C = Logger.colors;

class Console {
  constructor(ctx) {
    this.ctx = ctx;
    this.log = ctx.logger.child('console');
    this.rl = null;
    this.prompt = `${C.cyan}gt>${C.reset} `;
  }

  start() {
    this.rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: this.prompt });
    this.rl.prompt();
    this.rl.on('line', (line) => this.handle(line.trim()).finally(() => this.rl.prompt()));
    this.rl.on('SIGINT', () => this.ctx.shutdown && this.ctx.shutdown());
  }

  stop() { if (this.rl) this.rl.close(); }

  help() {
    return [
      'Konsol komutlari:',
      '  help                 - bu yardim',
      '  status               - sunucu durumu',
      '  who                  - online oyuncular',
      '  worlds               - dunya listesi',
      '  say <metin>          - global duyuru',
      '  kick <oyuncu>        - oyuncuyu at',
      '  ban <oyuncu> [dk]    - oyuncuyu yasakla',
      '  unban <oyuncu>       - yasagi kaldir',
      '  mute <oyuncu> [dk]   - susturma',
      '  give <oyuncu> <id> [adet]   - esya ver',
      '  setrole <oyuncu> <rol>      - rol ata',
      '  setgems <oyuncu> <miktar>   - gem ayarla',
      '  event start <id>            - olay baslat',
      '  event stop <id>             - olay durdur',
      '  save                 - hemen kaydet',
      '  reload               - yapilandirmayi yenile (yumusak)',
      '  stop / exit          - sunucuyu kapat'
    ].join('\n');
  }

  async handle(line) {
    if (!line) return;
    const parts = line.split(/\s+/);
    const cmd = parts[0];
    const a = parts.slice(1);
    const ctx = this.ctx;
    try {
      switch (cmd) {
        case 'help': console.log(this.help()); break;
        case 'status': {
          console.log(`Online: ${ctx.players.onlineCount()} / Toplam: ${ctx.players.count()} / Dunyalar: ${ctx.worlds.count()}`);
          console.log(`Aktif olaylar: ${ctx.events.listActive().map(e => e.name).join(', ') || 'yok'}`);
          break;
        }
        case 'who': {
          const ps = ctx.players.online_list();
          if (!ps.length) console.log('Kimse cevrimici degil.');
          else for (const p of ps) console.log(`  ${p.role.padEnd(7)} ${p.name.padEnd(20)} @${p.world} lvl${p.level}`);
          break;
        }
        case 'worlds': {
          for (const w of ctx.worlds.list()) console.log(`  ${w.name.padEnd(24)} ziyaret:${w.visits} icinde:${w.players.length} ${w.special ? '['+w.special+']' : ''}`);
          break;
        }
        case 'say': {
          const text = a.join(' ');
          if (!text) return console.log('kullanim: say <metin>');
          ctx.chat.system('[Konsol] ' + text, 'global');
          ctx.broadcast && ctx.broadcast({ type: 'announce', text, source: 'console' });
          break;
        }
        case 'kick': {
          const p = ctx.players.get(a[0] || '');
          if (!p || !p.conn) return console.log('Oyuncu cevrimici degil.');
          ctx.kick && ctx.kick(p, 'Konsol tarafindan atildi');
          break;
        }
        case 'ban': ctx.bans.ban(a[0], 'CONSOLE', 'konsol', a[1] ? Number(a[1]) : null); console.log('Yasaklandi: ' + a[0]); break;
        case 'unban': console.log(ctx.bans.unban(a[0]) ? 'Yasak kaldirildi.' : 'Yasakli degil.'); break;
        case 'mute': ctx.bans.mute(a[0], 'CONSOLE', 'konsol', a[1] ? Number(a[1]) : 10); console.log('Susturuldu: ' + a[0]); break;
        case 'give': {
          const p = ctx.players.get(a[0]);
          if (!p) return console.log('Oyuncu yok.');
          ctx.players.addItem(p, Number(a[1]), Number(a[2] || 1));
          console.log('Verildi.');
          break;
        }
        case 'setrole': {
          const p = ctx.players.get(a[0]);
          if (!p) return console.log('Oyuncu yok.');
          if (!ctx.players.setRole(p, a[1])) return console.log('Gecersiz rol.');
          console.log('Rol guncellendi.');
          break;
        }
        case 'setgems': {
          const p = ctx.players.get(a[0]);
          if (!p) return console.log('Oyuncu yok.');
          p.gems = Number(a[1]);
          ctx.db.mark('players');
          console.log('Gem ayarlandi.');
          break;
        }
        case 'event': {
          if (a[0] === 'start') ctx.events.start(a[1]);
          else if (a[0] === 'stop') ctx.events.stop(a[1]);
          else console.log('kullanim: event start|stop <id>');
          break;
        }
        case 'save': ctx.db.saveAll(true); console.log('Tum tablolar kaydedildi.'); break;
        case 'reload': ctx.reloadConfig && ctx.reloadConfig(); console.log('Konfig yeniden okundu.'); break;
        case 'stop': case 'exit': case 'quit': ctx.shutdown && ctx.shutdown(); break;
        default: console.log(`Bilinmeyen: ${cmd}. 'help' yaz.`);
      }
    } catch (e) {
      console.log('Hata: ' + e.message);
    }
  }
}

module.exports = Console;
