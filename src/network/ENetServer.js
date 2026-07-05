// Growtopia ENet sunucusu - growtopia.js (Rust + NAPI) ile.
// Bu paket Growtopia'nin ozel CRC32 + range coder kombinasyonunu destekler.
// useNewPacket + useNewServerPacket ayarlari modern GT istemcisinin protokol surumune uyar.
const { Client, TextPacket, TankPacket, Variant } = require('growtopia.js');
const World = require('./WorldSerializer');

// GT tank paket tipleri (GrowServer TankTypes ile ayni)
const TANK = {
  STATE: 0, CALL_FUNCTION: 1, UPDATE_STATUS: 2, TILE_CHANGE_REQUEST: 3,
  SEND_MAP_DATA: 4, SEND_TILE_UPDATE_DATA: 5, TILE_ACTIVATE_REQUEST: 7,
  TILE_APPLY_DAMAGE: 8, SEND_INVENTORY_STATE: 9, ITEM_ACTIVATE_REQUEST: 10,
  SEND_ITEM_DATABASE_DATA: 16, SET_CHARACTER_STATE: 20
};

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
  // Variant'i belirli bir netID hedefiyle gonder (OnSetPos vb. icin gerekli)
  sendVariantTo(netID, targetNetID, ...args) {
    try {
      const tp = Variant.from({ netID: targetNetID }, ...args).parse();
      const buf = tp.parse ? tp.parse() : tp;
      this.sendRaw(netID, buf);
    } catch (e) { this.log.error('variant gondermede hata: ' + e.message); }
  }
  sendTank(netID, tank) {
    try {
      const buf = TankPacket.from(tank).parse();
      if (buf) this.sendRaw(netID, buf);
    } catch (e) { this.log.error('tank gondermede hata: ' + e.message); }
  }
  sendConsole(netID, text) { this.sendVariant(netID, 'OnConsoleMessage', text); }
  sendDialog(netID, text) { this.sendVariant(netID, 'OnDialogRequest', text); }
  sendSetBux(netID, amount) { this.sendVariant(netID, 'OnSetBux', amount); }
  sendTalkBubble(netID, who, text, color = 0) { this.sendVariant(netID, 'OnTalkBubble', who, text, color); }

  buildSpawnAvatar(netID, player, local) {
    return 'spawn|avatar\n' +
      `netID|${netID}\n` +
      `userID|${player.id}\n` +
      'colrect|0|0|20|30\n' +
      `posXY|${Math.floor(player.x * 32)}|${Math.floor(player.y * 32)}\n` +
      `name|\`w${player.name}\`\`\n` +
      'country|tr\n' +
      'invis|0\n' +
      'mstate|0\n' +
      'smstate|0\n' +
      'onlineID|\n' +
      (local ? 'type|local\n' : '');
  }

  // GT envanteri: u8 versiyon | u32 slot | u16 adet | [u16 id, u16 miktar]
  sendInventory(netID, items) {
    const buf = Buffer.alloc(7 + items.length * 4);
    buf.writeUInt8(0x1, 0);
    buf.writeUInt32LE(Math.max(items.length, 32), 1);
    buf.writeUInt16LE(items.length, 5);
    let o = 7;
    for (const it of items) {
      buf.writeUInt16LE(it.id, o);
      buf.writeUInt16LE(it.amount, o + 2);
      o += 4;
    }
    this.sendTank(netID, { type: TANK.SEND_INVENTORY_STATE, data: () => buf });
  }

  // items.dat'i istemciye gonder (refresh_item_data cevabi)
  sendItemsDat(netID) {
    const gi = this.ctx.gtItems;
    if (!gi || !gi.content) {
      this.sendConsole(netID, '`4Sunucuda items.dat yok.');
      return;
    }
    this.sendConsole(netID, 'Esya verisi guncelleniyor, bir saniye...');
    this.sendTank(netID, { type: TANK.SEND_ITEM_DATABASE_DATA, data: () => gi.content });
    this.log.info(`>> netID=${netID} items.dat gonderildi (${gi.content.length} bayt)`);
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
      this.leaveWorldGT(s);
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

    if (action === 'refresh_item_data') {
      this.sendItemsDat(session.netID);
      return;
    }
    if (action === 'enter_game') {
      this.sendWorldSelectMenu(session.netID);
      return;
    }
    if (action === 'quit_to_exit') {
      // Dunyadan cik -> dunya secim menusu
      this.leaveWorldGT(session);
      this.sendWorldSelectMenu(session.netID);
      return;
    }
    if (action === 'quit') {
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
    if (action === 'respawn' || action === 'respawn_spike') {
      const w = this.ctx.worlds.get(session.player.world);
      if (w) {
        World.ensureTiles(w);
        session.player.x = w.spawn.x;
        session.player.y = w.spawn.y;
        this.sendVariantTo(session.netID, session.netID, 'OnSetPos', [w.spawn.x * 32, w.spawn.y * 32]);
      }
      return;
    }
    this.log.debug('action', { action });
  }

  handleTank(session, buf) {
    if (!session.player) return;
    if (buf.length < 60) return;
    const ptype = buf.readUInt8(4);

    // Type 0 = PlayerState (hareket). x=offset 28, y=offset 32 (GT tank yerlesimi)
    if (ptype === TANK.STATE) {
      const x = buf.readFloatLE(28);
      const y = buf.readFloatLE(32);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        session.player.x = Math.max(0, x / 32);
        session.player.y = Math.max(0, y / 32);
      }
      // netID alanini sunucu damgalar, diger oyunculara yayinlanir
      buf.writeInt32LE(session.netID, 8);
      this.broadcastTankRaw(session, buf);
      return;
    }

    // Type 3 = TileChangeRequest (yumruk / blok yerlestirme)
    if (ptype === TANK.TILE_CHANGE_REQUEST) {
      const itemId = buf.readInt32LE(24);   // kullanilan esya (18 = yumruk)
      const tx = buf.readInt32LE(48);
      const ty = buf.readInt32LE(52);
      const w = this.ctx.worlds.get(session.player.world);
      if (!w) return;
      const r = World.applyTileChange(w, tx, ty, itemId, this.ctx.gtItems);
      if (!r.ok) return;
      if (r.broken || r.placed) this.ctx.db.mark('worlds');
      // Istek paketi sender netID'si ile herkese (gonderen dahil) geri yayinlanir
      buf.writeInt32LE(session.netID, 8);
      for (const s of this.peers.values()) {
        if (!s.player || s.player.world !== session.player.world) continue;
        this.sendRaw(s.netID, buf);
      }
      return;
    }
  }

  // ---- Login ----
  attemptLogin(session, name, password) {
    // 1) WebView'dan gelen token ise (HTTPS dashboard'dan), onu tani
    const tokens = this.ctx.gtLoginTokens;
    let res = null;
    if (tokens) {
      // (a) password dogrudan token mi?
      const tokRec = tokens.get(password);
      if (tokRec && tokRec.until > Date.now()) {
        const player = this.ctx.players.data.players[tokRec.key];
        if (player) {
          res = { ok: true, player };
          tokens.delete(password); // token tek kullanimlik
          this.log.info(`[GT-LOGIN] ENet token ile giris: ${name}`);
        }
      }
      // (b) growID icin aktif bir webview giris var mi?
      if (!res) {
        const growKey = `growid:${name.toLowerCase()}`;
        const gRec = tokens.get(growKey);
        if (gRec && gRec.until > Date.now()) {
          const player = this.ctx.players.data.players[gRec.key];
          if (player) {
            res = { ok: true, player };
            tokens.delete(growKey);
            this.log.info(`[GT-LOGIN] ENet growID-token ile giris: ${name}`);
          }
        }
      }
    }
    // 2) Yine olmadiysa klasik password login
    if (!res) {
      res = this.ctx.players.login(name, password);
      if (!res.ok && res.error === 'Oyuncu bulunamadi.') {
        res = this.ctx.players.register(name, password || 'changeme');
      }
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

    // Gercek GT login accept sirasi:
    // 1) Magic accept variant - ilk parametre sunucunun items.dat proton hash'i.
    //    Istemcinin lokal hash'i farkliysa "refresh_item_data" ister.
    const itemsHash = (this.ctx.gtItems && this.ctx.gtItems.hash) || 0;
    this.sendVariant(session.netID, 'OnSuperMainStartAcceptLogonHrdxs47254722215a', itemsHash, 'ubistatic-a.akamaihd.net', '0098/41/01/refs/heads/master/cache/', 'cc.cz.madkite.freedom org.aqua.gg idv.aqua.bulldog com.cih.gamecih2 com.cih.gamecih com.cih.game_cih cn.maocai.gamekiller com.gmd.speedtime org.dax.attack com.x0.strai.frep com.x0.strai.free org.cheatengine.cegui org.sbtools.gamehack com.skgames.traffikrider org.sbtoods.gamehaca com.skype.ralder org.cheatengine.cegui.xx.multi1458919170111 com.prohiro.macro me.autotouch.autotouch com.cygery.repetitouch.free com.cygery.repetitouch.pro com.proziro.zacro com.slash.gamebuster', 'proto=200|choosemusic=audio/mp3/about_theme.mp3|active_holiday=0|wing_week_day=0|ubi_week_day=0|server_tick=24400370|clash_active=0|drop_lavacheck_faster=1|isPayingUser=1|usingStoreNavigation=1|enableInventoryTab=1|bigBackpack=1|');
    this.log.info(`>> netID=${session.netID} OnSuperMainStartAcceptLogonHrdxs gonderildi (items hash=${itemsHash})`);

    // 2) Bux gem sayisi
    this.sendSetBux(session.netID, res.player.gems);
    // 3) Istemci "enter_game" gonderince dunya secim menusu acilir.
    //    Gondermeyen (eski/ozel) istemciler icin menuyu proaktif de yolla.
    this.sendWorldSelectMenu(session.netID);
  }

  sendWorldSelectMenu(netID) {
    const worlds = this.ctx.worlds.topVisited(8);
    let menu = 'default|START\nadd_button|Showing: `wDunyalar``|_catselect_|0.6|3529161471|\n';
    for (const w of worlds) {
      menu += `add_floater|${w.name}|${w.players.length}|0.55|3529161471\n`;
    }
    this.sendVariant(netID, 'OnRequestWorldSelectMenu', menu);
  }

  // Oyuncuyu mevcut dunyasindan cikar, diger oyunculara OnRemove yayinla.
  leaveWorldGT(session) {
    if (!session.player || !session.player.world) return;
    const worldName = session.player.world;
    this.ctx.worlds.leave(session.player);
    for (const s of this.peers.values()) {
      if (s === session || !s.player || s.player.world !== worldName) continue;
      this.sendVariant(s.netID, 'OnRemove', `netID|${session.netID}\n`);
      this.sendConsole(s.netID, `\`5<\`w${session.player.name}\`5 dunyadan ayrildi>\`\``);
    }
    session.player.world = null;
  }

  enterWorldFor(session, worldName) {
    // Baska bir dunyadaysa once oradan cikar (OnRemove yayini dahil)
    if (session.player.world) this.leaveWorldGT(session);
    let r = this.ctx.worlds.enter(session.player, worldName || 'START');
    // Dunya yoksa oyuncu icin olustur (GT davranisi: her isim gecerli dunya)
    if (!r.ok && r.error === 'Dunya bulunamadi.') {
      const c = this.ctx.worlds.create(worldName, session.player.name);
      if (c.ok) r = this.ctx.worlds.enter(session.player, worldName);
    }
    const w = (r && r.ok) ? r.world : this.ctx.worlds.get('START');
    if (!w) return;
    World.ensureTiles(w);
    session.player.x = w.spawn.x;
    session.player.y = w.spawn.y;

    // 1) Dunya binary verisi (SEND_MAP_DATA)
    const mapData = World.serialize(w);
    this.sendTank(session.netID, { type: TANK.SEND_MAP_DATA, state: 8, data: () => mapData });
    this.log.info(`>> netID=${session.netID} dunya verisi: ${w.name} (${mapData.length} bayt)`);

    // 2) Kendi avatarini spawn et (type|local)
    this.sendVariant(session.netID, 'OnSpawn', this.buildSpawnAvatar(session.netID, session.player, true));

    // 3) Dunyadaki diger oyunculari bu istemciye, bu istemciyi digerlerine spawn et
    for (const s of this.peers.values()) {
      if (s === session || !s.player || s.player.world !== w.name) continue;
      this.sendVariant(session.netID, 'OnSpawn', this.buildSpawnAvatar(s.netID, s.player, false));
      this.sendVariant(s.netID, 'OnSpawn', this.buildSpawnAvatar(session.netID, session.player, false));
      this.sendConsole(s.netID, `\`5<\`w${session.player.name}\`5 dunyaya girdi>\`\``);
    }

    // 4) Envanter + hosgeldin
    this.sendInventory(session.netID, [
      { id: 18, amount: 1 },    // Yumruk
      { id: 32, amount: 1 },    // Ingiliz anahtari
      { id: 2, amount: 200 },   // Toprak
      { id: 14, amount: 200 },  // Magara arkaplani
      { id: 10, amount: 10 },   // Kapi
      { id: 20, amount: 10 },   // Tabela
      { id: 4, amount: 50 }     // Lav
    ]);
    this.sendConsole(session.netID, `\`oDunya \`w${w.name}\`o girildi. \`5${w.players.length}\`o kisi burada. Komutlar icin \`w/help\`o yaz.`);
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
