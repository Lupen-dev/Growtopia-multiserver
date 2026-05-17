// Growtopia ENet sunucusu - growtopia.js (Rust + NAPI) ile.
// Bu paket Growtopia'nin ozel CRC32 + range coder kombinasyonunu destekler.
// useNewPacket + useNewServerPacket ayarlari modern GT istemcisinin protokol surumune uyar.
const { Client, TextPacket, TankPacket, Variant } = require('growtopia.js');

class ENetServer {
  constructor(ctx) {
    this.ctx = ctx;
    this.log = ctx.logger.child('enet');
    this.client = null;
    this.peers = new Map(); // netID -> session
  }

  async start(port = 17091, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      try {
        this.client = new Client({
          enet: {
            ip: host, port, peerLimit: 256, channelLimit: 2,
            useNewPacket: { asClient: false },
            useNewServerPacket: true,
            enableCompressor: true,
            enableChecksum: true
          }
        });

        this.client.on('ready', () => {
          this.log.success(`ENet (growtopia.js) dinliyor: ${host}:${port}`);
          resolve();
        });
        this.client.on('error', (err) => this.log.error('ENet hata: ' + (err && err.message)));
        this.client.on('connect', (netID) => this.onConnect(netID));
        this.client.on('disconnect', (netID) => this.onDisconnect(netID));
        this.client.on('raw', (netID, channelID, data) => this.onRaw(netID, channelID, data));

        this.client.listen();
      } catch (e) { reject(e); }
    });
  }

  stop() {
    if (!this.client) return;
    for (const [netID] of this.peers) {
      try { this.client.host.getPeer(netID).disconnectNow(this.client.host, 0); } catch {}
    }
  }

  // ---- Helpers ----
  sendRaw(netID, buf) { try { this.client.send(netID, 0, { parse: () => buf }); } catch {} }
  sendType(netID, packetType, body) {
    const text = body || '';
    const buf = Buffer.alloc(4 + Buffer.byteLength(text) + 1);
    buf.writeUInt32LE(packetType, 0);
    buf.write(text, 4, 'utf8');
    buf[buf.length - 1] = 0;
    this.sendRaw(netID, buf);
  }
  sendText(netID, body) { this.sendType(netID, 2, body); }
  sendGameMessage(netID, body) { this.sendType(netID, 3, body); }
  sendVariant(netID, ...args) {
    try {
      const tp = Variant.from({ netID: -1 }, ...args).parse();
      const buf = tp.parse ? tp.parse() : tp;
      this.sendRaw(netID, buf);
    } catch (e) { this.log.error('variant gondermede hata: ' + e.message); }
  }
  sendConsole(netID, text) { this.sendVariant(netID, 'OnConsoleMessage', text); }
  sendDialog(netID, text) { this.sendVariant(netID, 'OnDialogRequest', text); }
  sendSetBux(netID, amount) { this.sendVariant(netID, 'OnSetBux', amount); }
  sendTalkBubble(netID, who, text, color = 0) { this.sendVariant(netID, 'OnTalkBubble', who, text, color); }
  sendSpawnSelf(netID, player) {
    const data =
`spawn|avatar
netID|${netID}
userID|${player.id}
colrect|0|0|20|30
posXY|${Math.floor(player.x * 32)}|${Math.floor(player.y * 32)}
name|\`w${player.name}
country|tr
invis|0
mstate|0
smstate|0
type|local
`;
    this.sendVariant(netID, 'OnSpawn', data);
  }

  // ---- Lifecycle ----
  onConnect(netID) {
    this.peers.set(netID, {
      netID, player: null, state: 'awaiting_login',
      loginAttempts: 0, connectedAt: Date.now()
    });
    // 1. paket: REQUEST_LOGIN_INFO (type 1, hicbir body yok) - GT HELLO
    try {
      this.client.send(netID, 0, TextPacket.from(0x1));
      this.log.info(`>> netID=${netID} HELLO (type=1) gonderildi`);
    } catch (e) { this.log.error('hello gonderemedi: ' + e.message); }
    this.log.info(`baglanti #${netID} (ENet handshake basarili, login paketi bekleniyor)`);
  }

  // Klasik GT private server login dialog'u. UbiServices clienti login_request'i
  // dogrudan gondermezse bu dialog'u acariz; oyuncu growID + sifre girer.
  sendLoginDialog(netID) {
    const dialog =
`set_default_color|\`o
add_label_with_icon|big|\`wGrowTurk - GrowID Login|left|6
add_spacer|small|
add_textbox|\`oHesabina giris yap veya yeni hesap olustur.|left
add_text_input|growID|GrowID|YOUR_GROWID|18
add_text_input_password|password|Sifre||30
add_spacer|small|
add_textbox|\`9Hesabin yoksa otomatik olusturulur.|left
add_quick_exit|
end_dialog|GROWID_LOGIN_VALIDATE|Iptal|Giris|`;
    this.sendVariant(netID, 'OnDialogRequest', dialog);
    this.log.info(`>> netID=${netID} GROWID_LOGIN_VALIDATE dialog gonderildi`);
  }

  onDisconnect(netID) {
    const s = this.peers.get(netID);
    const dur = s && s.connectedAt ? Math.round((Date.now() - s.connectedAt) / 1000) : '?';
    if (s && s.player) {
      this.ctx.chat.system(`* ${s.player.name} sunucudan ayrildi`, 'global');
      this.ctx.worlds.leave(s.player);
      this.ctx.players.detachConnection(s.player);
    }
    this.peers.delete(netID);
    this.log.info(`baglanti #${netID} kapandi (sure: ${dur}s, state: ${s ? s.state : 'unknown'})`);
  }

  onRaw(netID, channelID, data) {
    if (!Buffer.isBuffer(data)) data = Buffer.from(data);
    if (data.length < 4) {
      this.log.warn(`<< netID=${netID} kucuk paket (${data.length}b): ${data.toString('hex')}`);
      return;
    }
    const type = data.readUInt32LE(0);

    // Her zaman ozet logla (protokolu anlamak icin kritik)
    const preview = data.length > 64
      ? data.slice(0, 64).toString('hex') + '...'
      : data.toString('hex');
    const typeNames = { 0:'UNK', 1:'HELLO', 2:'STR', 3:'ACTION', 4:'TANK', 5:'ERROR', 6:'TRACK', 7:'LOG_REQ', 8:'LOG_RES' };
    this.log.info(`<< netID=${netID} type=${type}(${typeNames[type]||'?'}) ch=${channelID} len=${data.length} hex=${preview}`);

    // Text paketlerinin govdesini de logla (DEBUG_TEXT=1 ile)
    if ((type === 2 || type === 3) && process.env.DEBUG_TEXT) {
      const body = data.slice(4).toString('utf8').replace(/\0+$/, '');
      this.log.debug(`   body: ${body.replace(/\n/g, ' | ')}`);
    }

    const session = this.peers.get(netID);
    if (!session) return;

    try {
      if (type === 0x2 || type === 0x3) this.handleText(session, data);
      else if (type === 0x4) this.handleTank(session, data);
    } catch (e) { this.log.error('paket islerken hata', { err: e.message }); }
  }

  parseText(buf) {
    const body = buf.slice(4).toString('utf8').replace(/\0+$/, '').trim();
    const map = {}; const lines = body.split('\n').filter(l => l);
    for (const l of lines) { const i = l.indexOf('|'); if (i > 0) map[l.slice(0, i)] = l.slice(i + 1); else map[l] = ''; }
    return { body, map, lines };
  }

  handleText(session, data) {
    const { map } = this.parseText(data);
    const action = map.action || '';

    if (session.state === 'awaiting_login') {
      // 1) Klasik login_request: client tankIDName/tankIDPass/requestedName direkt yollar
      const name = (map.requestedName || map.tankIDName || map.growid || map.growID || '').trim();
      const password = map.tankIDPass || map.password || '';

      // 2) Dialog_return: OnDialogRequest cevabi olarak gelir
      if (action === 'dialog_return' && map.dialog_name === 'GROWID_LOGIN_VALIDATE') {
        const dname = (map.growID || map.growid || '').trim();
        const dpass = map.password || '';
        this.log.info(`<< netID=${session.netID} dialog GROWID_LOGIN_VALIDATE -> ${dname}`);
        if (!dname) {
          this.sendLoginDialog(session.netID);
          return;
        }
        this.attemptLogin(session, dname, dpass);
        return;
      }

      // 3) "action|enter_game" gibi bos ilk paket - dialog yolla
      if (!name && (action === 'enter_game' || action === 'quit_to_exit' || !action)) {
        this.log.info(`<< netID=${session.netID} login icin dialog gonderiliyor (ilk paket bos)`);
        this.sendLoginDialog(session.netID);
        return;
      }

      if (!name) {
        this.log.debug(`<< netID=${session.netID} login bekleniyor, isim yok: ` + JSON.stringify(map).slice(0, 200));
        this.sendLoginDialog(session.netID);
        return;
      }
      this.attemptLogin(session, name, password);
      return;
    }

    if (action === 'enter_game' || action === 'refresh_item_data') {
      this.enterWorldFor(session, session.player.world || 'START');
      return;
    }
    if (action === 'quit_to_exit' || action === 'quit') {
      try { this.client.host.getPeer(session.netID).disconnect(this.client.host, 0); } catch {}
      return;
    }
    if (action === 'join_request') {
      this.enterWorldFor(session, (map.name || 'START').toUpperCase());
      return;
    }
    if (action === 'input') {
      const text = (map.text || '').trim();
      if (!text) return;
      if (text.startsWith('/')) {
        this.ctx.cmd.execute(session.player, text).then(r => {
          this.sendConsole(session.netID, r.text || (r.ok ? '`5ok' : '`4' + (r.error || 'hata')));
        });
      } else {
        const r = this.ctx.chat.say(session.player, text);
        if (!r.ok) this.sendConsole(session.netID, '`4' + r.error);
        else this.broadcastChat(session, text);
      }
      return;
    }
    if (action === 'respawn') { this.enterWorldFor(session, session.player.world); return; }
    this.log.debug('action', { action });
  }

  handleTank(session, buf) {
    if (!session.player) return;
    if (buf.length < 60) return;
    const ptype = buf.readUInt8(4);
    // Type 0 = PlayerState (movement)
    if (ptype === 0) {
      const x = buf.readFloatLE(32);
      const y = buf.readFloatLE(36);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        session.player.x = Math.max(0, x / 32);
        session.player.y = Math.max(0, y / 32);
      }
      this.broadcastTankRaw(session, buf);
      return;
    }
    // Type 3 = TileChangeRequest
    if (ptype === 3) {
      this.broadcastTankRaw(session, buf);
      return;
    }
  }

  // ---- Login ----
  attemptLogin(session, name, password) {
    // Sifre yoksa (GrowID/HTTPS akisinda webden token geldiyse) auto-register/lookup.
    let res = this.ctx.players.login(name, password);
    if (!res.ok && res.error === 'Oyuncu bulunamadi.') {
      res = this.ctx.players.register(name, password || 'changeme');
    }
    if (!res.ok) {
      this.sendDialog(session.netID,
        'set_default_color|`o\n' +
        'add_label_with_icon|big|Giris Hatasi|left|6\n' +
        'add_textbox|' + res.error + '|left\n' +
        'add_quick_exit|\n' +
        'end_dialog|fail||OK|');
      session.loginAttempts++;
      if (session.loginAttempts > 3) try { this.client.host.getPeer(session.netID).disconnectLater(this.client.host, 0); } catch {}
      return;
    }
    if (this.ctx.bans.isBanned(res.player.name)) {
      this.sendDialog(session.netID,
        'add_label_with_icon|big|Banlandin|left|6\n' +
        'add_textbox|Hesap yasakli.|left\n' +
        'end_dialog|ban||OK|');
      try { this.client.host.getPeer(session.netID).disconnect(this.client.host, 0); } catch {}
      return;
    }

    session.player = res.player;
    session.state = 'logged_in';
    this.ctx.players.attachConnection(res.player, {
      ws: { readyState: 1, close: () => { try { this.client.host.getPeer(session.netID).disconnect(this.client.host, 0); } catch {} } },
      send: (obj) => {
        if (obj.type === 'kicked') this.sendDialog(session.netID, 'add_textbox|Atildin: ' + (obj.reason || '') + '|left\nend_dialog|kick||OK|');
      },
      ip: '0.0.0.0'
    });
    this.log.success(`giris: ${name} (netID ${session.netID})`);

    // Klasik GT private server login accept sirasi:
    // 1) Magic accept variant - client buradan sonra spawn paketi kabul eder
    this.sendVariant(session.netID, 'OnSuperMainStartAcceptLogonHrdxs47254722215a', 0, 'ubistatic-a.akamaihd.net', '0098/41/01/refs/heads/master/cache/', 'cc.cz.madkite.freedom org.aqua.gg idv.aqua.bulldog com.cih.gamecih2 com.cih.gamecih com.cih.game_cih cn.maocai.gamekiller com.gmd.speedtime org.dax.attack com.x0.strai.frep com.x0.strai.free org.cheatengine.cegui org.sbtools.gamehack com.skgames.traffikrider org.sbtoods.gamehaca com.skype.ralder org.cheatengine.cegui.xx.multi1458919170111 com.prohiro.macro me.autotouch.autotouch com.cygery.repetitouch.free com.cygery.repetitouch.pro com.proziro.zacro com.slash.gamebuster', 'proto=200|choosemusic=audio/mp3/about_theme.mp3|active_holiday=0|wing_week_day=0|ubi_week_day=0|server_tick=24400370|clash_active=0|drop_lavacheck_faster=1|isPayingUser=1|usingStoreNavigation=1|enableInventoryTab=1|bigBackpack=1|');
    this.log.info(`>> netID=${session.netID} OnSuperMainStartAcceptLogonHrdxs gonderildi`);

    // 2) Bux gem sayisi
    this.sendSetBux(session.netID, res.player.gems);
    // 3) Dunyaya gir (OnSpawn dahil)
    this.enterWorldFor(session, res.player.world || 'START');
  }

  enterWorldFor(session, worldName) {
    const r = this.ctx.worlds.enter(session.player, worldName || 'START');
    const w = (r && r.ok) ? r.world : this.ctx.worlds.get('START');
    if (!w) return;
    this.sendDialog(session.netID,
`set_default_color|\`o
add_spacer|small|
add_label_with_icon|big|\`wHosgeldin ${session.player.name}!|left|6
add_label_with_icon|small|\`o${this.ctx.config.server.motd}|left|18
add_textbox|Komutlar icin /help yaz.|left
add_spacer|small|
end_dialog|welcome||TAMAM|`);
    this.sendConsole(session.netID, `\`6${w.name}\`\` dunyasina girdin. (${w.players.length} kisi)`);
    this.sendSpawnSelf(session.netID, session.player);
  }

  // ---- Broadcasts ----
  broadcastChat(session, text) {
    const world = session.player.world;
    for (const s of this.peers.values()) {
      if (!s.player || s.player.world !== world) continue;
      this.sendTalkBubble(s.netID, session.netID, text, 0);
      this.sendConsole(s.netID, `\`w<\`${this.colorForRole(session.player.role)}${session.player.name}\`w> \`o${text}`);
    }
  }
  broadcastTankRaw(session, buf) {
    const world = session.player.world;
    for (const s of this.peers.values()) {
      if (s === session) continue;
      if (!s.player || s.player.world !== world) continue;
      this.sendRaw(s.netID, buf);
    }
  }
  broadcast(buf) { for (const s of this.peers.values()) this.sendRaw(s.netID, buf); }

  colorForRole(role) { return ({ owner: '4', admin: '5', mod: '2', helper: '3', vip: '6' })[role] || 'w'; }

  kick(player, reason) {
    const s = [...this.peers.values()].find(x => x.player && x.player.key === player.key);
    if (!s) return;
    this.sendDialog(s.netID, `add_textbox|${reason || 'Atildin.'}|left\nend_dialog|kick||OK|`);
    setTimeout(() => { try { this.client.host.getPeer(s.netID).disconnect(this.client.host, 0); } catch {} }, 200);
  }
}

module.exports = ENetServer;
