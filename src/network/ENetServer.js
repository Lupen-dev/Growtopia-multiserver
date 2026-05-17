// Growtopia ENet sunucusu - port 17091
// Resmi Growtopia istemcisi (hosts dosyasi yonlendirmesi ile) buraya baglanir.
// Protokol: ENet UDP + Growtopia text/binary paketleri.

const enet = require('enet');
const P = require('./GTProtocol');

const PROTOCOL = 174; // GT protokol versiyonu (yaklasik). Yeni client'larda guncellenir.

class ENetServer {
  constructor(ctx) {
    this.ctx = ctx;
    this.log = ctx.logger.child('enet');
    this.host = null;
    this.peers = new Map(); // peerId -> { peer, player, netID, state }
    this.nextNetID = 1;
  }

  async start(port = 17091, host = '0.0.0.0') {
    return new Promise((resolve, reject) => {
      const addr = new enet.Address(host, port);
      enet.createServer({ address: addr, peers: 256, channels: 2, down: 0, up: 0 }, (err, server) => {
        if (err) return reject(err);
        this.host = server;
        server.on('connect', (peer) => this.onConnect(peer));
        server.on('disconnect', (peer) => this.onDisconnect(peer));
        server.start(16); // poll every 16ms
        this.log.success(`ENet (Growtopia) sunucusu dinliyor: ${host}:${port}`);
        resolve();
      });
    });
  }

  stop() {
    if (this.host) try { this.host.stop(); } catch {}
  }

  peerKey(peer) { return peer && peer._pointer != null ? peer._pointer : peer; }

  send(peer, buf, flags = enet.PACKET_FLAG.RELIABLE) {
    try {
      const pkt = new enet.Packet(buf, flags);
      peer.send(0, pkt);
    } catch (e) { this.log.debug('send fail', { err: e.message }); }
  }

  sendText(peer, text, type = P.TYPE.STRING) { this.send(peer, P.makeTextPacket(text, type)); }
  sendConsole(peer, text) { this.send(peer, P.onConsoleMessage(text)); }
  sendDialog(peer, text) { this.send(peer, P.onDialogRequest(text)); }
  sendVariant(peer, variant, netID = 0) { this.send(peer, variant.toTankPacket(netID)); }

  onConnect(peer) {
    const key = this.peerKey(peer);
    const netID = this.nextNetID++;
    const state = { peer, netID, player: null, state: 'awaiting_login', loginAttempts: 0 };
    this.peers.set(key, state);

    peer.on('message', (pkt, channel) => this.onMessage(state, pkt.data()));

    // Login istegi gonder (Type 1 raw)
    const buf = Buffer.alloc(4);
    buf.writeUInt32LE(P.TYPE.REQUEST_LOGIN_INFO, 0);
    this.send(peer, buf);
    this.log.info(`baglanti #${netID} kuruldu`);
  }

  onDisconnect(peer) {
    const key = this.peerKey(peer);
    const s = this.peers.get(key);
    if (!s) return;
    if (s.player) {
      this.ctx.chat.system(`* ${s.player.name} sunucudan ayrildi`, 'global');
      this.ctx.worlds.leave(s.player);
      this.ctx.players.detachConnection(s.player);
    }
    this.peers.delete(key);
    this.log.info(`baglanti #${s.netID} koptu`);
  }

  onMessage(state, buf) {
    if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
    if (buf.length < 4) return;
    const type = buf.readUInt32LE(0);
    try {
      if (type === P.TYPE.STRING || type === P.TYPE.GAME_MESSAGE) {
        const parsed = P.parseTextPacket(buf);
        if (parsed) this.handleText(state, parsed);
      } else if (type === P.TYPE.GAME_PACKET) {
        const tank = P.parseTankPacket(buf);
        if (tank) this.handleTank(state, tank);
      }
    } catch (e) { this.log.error('mesaj islerken hata', { err: e.message }); }
  }

  // Text/Game message akisi (login, enter_game, action|join_request vb.)
  handleText(state, packet) {
    const action = packet.map.action || '';
    const peer = state.peer;

    // Ilk login - growtopia istemcisi "requestedName", "tankIDName", "tankIDPass" gonderir
    if (state.state === 'awaiting_login') {
      const name = (packet.map.requestedName || packet.map.tankIDName || '').trim();
      const password = packet.map.tankIDPass || '';
      if (!name) return;
      this.attemptLogin(state, name, password);
      return;
    }

    if (action === 'enter_game' || action === 'refresh_item_data') {
      this.spawnIntoWorld(state, state.player.world || 'START');
      return;
    }
    if (action === 'quit_to_exit' || action === 'quit') {
      this.spawnIntoWorld(state, 'EXIT');
      return;
    }
    if (action === 'join_request') {
      const name = (packet.map.name || 'START').toUpperCase();
      this.enterWorld(state, name);
      return;
    }
    if (action === 'input' || action === 'say') {
      // Sohbet veya komut. /komut ise mevcut sistem icine yonlendir.
      const text = (packet.map.text || '').trim();
      if (!text) return;
      if (text.startsWith('/')) {
        this.ctx.cmd.execute(state.player, text).then(r => {
          this.sendConsole(peer, r.text || (r.ok ? '`5ok' : '`4hata: ' + (r.error || '')));
        });
      } else {
        const r = this.ctx.chat.say(state.player, text);
        if (!r.ok) this.sendConsole(peer, '`4' + r.error);
        else this.broadcastChat(state, text);
      }
      return;
    }
    if (action === 'respawn') {
      this.spawnIntoWorld(state, state.player.world);
      return;
    }
    // Bilinmeyen action - debug
    this.log.debug('action', { action, map: packet.map });
  }

  // Binary TankPacket (hareket, blok yerlestirme, vurus vb.)
  handleTank(state, tank) {
    if (!state.player) return;
    // type 0: PLAYER_STATE (hareket)
    if (tank.packetType === 0) {
      state.player.x = Math.max(0, tank.x);
      state.player.y = Math.max(0, tank.y);
      // Yayin: dunyadaki digerlerine yansit
      this.broadcastTank(state, tank);
    }
    // type 3: TILE_CHANGE_REQUEST (kirma/yerleme)
    if (tank.packetType === 3) {
      const w = this.ctx.worlds.get(state.player.world);
      if (w) {
        // Basit: var olan blok varsa kir, yoksa yerlestir
        const idx = w.blocks.findIndex(b => b.x === tank.intX && b.y === tank.value);
        if (idx >= 0) {
          this.ctx.players.addItem(state.player, w.blocks[idx].item);
          w.blocks.splice(idx, 1);
        } else if (state.player.inventory[1]) {
          w.blocks.push({ x: tank.intX, y: tank.value, item: 1, by: state.player.name });
          this.ctx.players.removeItem(state.player, 1);
        }
        this.ctx.db.mark('worlds');
        this.broadcastTank(state, tank);
      }
    }
  }

  attemptLogin(state, name, password) {
    // Kayit yoksa otomatik kayit (basit). Production'da bunu cikar/degistir.
    let result = this.ctx.players.login(name, password);
    if (!result.ok && result.error === 'Oyuncu bulunamadi.') {
      result = this.ctx.players.register(name, password);
    }
    if (!result.ok) {
      this.sendDialog(state.peer,
        'set_default_color|`o\nadd_label_with_icon|big|Giris Hatasi|left|6\n' +
        'add_textbox|' + result.error + '|left\nadd_quick_exit|\nend_dialog|fail||OK|');
      state.loginAttempts++;
      if (state.loginAttempts > 3) try { state.peer.disconnect(); } catch {}
      return;
    }
    if (this.ctx.bans.isBanned(result.player.name)) {
      this.sendDialog(state.peer, 'add_label_with_icon|big|Banlandin|left|6\nadd_textbox|Hesap yasakli.|left\nend_dialog|ban||OK|');
      try { state.peer.disconnect(); } catch {}
      return;
    }
    state.player = result.player;
    state.state = 'logged_in';
    this.ctx.players.attachConnection(state.player, {
      ws: { readyState: 1, close: () => state.peer.disconnect() },
      send: (obj) => {
        // mevcut WS uyumlu send -> GT'ye cevir
        if (obj.type === 'kicked') {
          this.sendDialog(state.peer, 'add_textbox|Atildin: ' + (obj.reason || '') + '|left\nend_dialog|kick||OK|');
        }
      },
      ip: '0.0.0.0'
    });
    this.log.success(`giris: ${name} (netID ${state.netID})`);

    // Login basarili: bux/world menusu gonder
    this.send(state.peer, P.onSetBux(state.player.gems));
    this.spawnIntoWorld(state, state.player.world || 'START');
  }

  spawnIntoWorld(state, worldName) {
    const w = this.ctx.worlds.enter(state.player, worldName || 'START').world || this.ctx.worlds.get('START');
    if (!w) return;
    const dialog =
`set_default_color|\`o
add_spacer|small|
add_label_with_icon|big|\`wHosgeldin ${state.player.name}!|left|6
add_label_with_icon|small|\`o${this.ctx.config.server.motd}|left|18
add_spacer|small|
add_textbox|Komutlar icin /help yaz.|left
add_spacer|small|
end_dialog|welcome||TAMAM|`;
    this.sendDialog(state.peer, dialog);
    this.sendConsole(state.peer, `\`6${w.name}\`\` dunyasina girdin. (icinde: ${w.players.length})`);
    // OnSpawn (basit)
    this.send(state.peer, P.Variant.call('OnSpawn',
      `spawn|avatar\nnetID|${state.netID}\nuserID|${state.player.id}\ncolrect|0|0|20|30\nposXY|${state.player.x * 32}|${state.player.y * 32}\nname|\`w${state.player.name}\nmstate|0\nsmstate|0\ntype|local\n`
    ).toTankPacket());
  }

  enterWorld(state, name) {
    if (!state.player) return;
    const r = this.ctx.worlds.enter(state.player, name);
    if (!r.ok) { this.sendConsole(state.peer, '`4' + r.error); return; }
    this.spawnIntoWorld(state, name);
  }

  broadcastChat(state, text) {
    if (!state.player) return;
    const world = state.player.world;
    for (const s of this.peers.values()) {
      if (!s.player || s.player.world !== world) continue;
      this.send(s.peer, P.Variant.call('OnTalkBubble', state.netID, text, 0).toTankPacket(state.netID));
      this.sendConsole(s.peer, `\`w<\`${this.colorForRole(state.player.role)}${state.player.name}\`w> \`o${text}`);
    }
  }

  broadcastTank(state, tank) {
    if (!state.player) return;
    const world = state.player.world;
    const out = P.makeTankPacket({
      type: tank.packetType, netID: state.netID,
      state: tank.state, delay: tank.delay,
      x: tank.x, y: tank.y, xSpeed: tank.xSpeed, ySpeed: tank.ySpeed,
      value: tank.value, intX: tank.intX,
      extData: tank.extData
    });
    for (const s of this.peers.values()) {
      if (s === state) continue;
      if (!s.player || s.player.world !== world) continue;
      this.send(s.peer, out);
    }
  }

  colorForRole(role) {
    return ({ owner: '4', admin: '5', mod: '2', helper: '3', vip: '6' })[role] || 'w';
  }

  broadcast(buf) {
    for (const s of this.peers.values()) this.send(s.peer, buf);
  }

  // Komut sisteminin "ctx.kick" cagrisini destekle
  kick(player, reason) {
    const s = [...this.peers.values()].find(x => x.player && x.player.key === player.key);
    if (!s) return;
    this.sendDialog(s.peer, `add_textbox|${reason || 'Atildin.'}|left\nend_dialog|kick||OK|`);
    setTimeout(() => { try { s.peer.disconnect(); } catch {} }, 200);
  }
}

module.exports = ENetServer;
