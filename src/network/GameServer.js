// Oyuncularla WebSocket uzerinden konusan oyun sunucusu.
// (Gercek ENet/Growtopia istemcisi yerine, kendi web istemcimiz ws ile baglanir.)
const WebSocket = require('ws');
const http = require('http');
const url = require('url');

class GameServer {
  constructor(ctx) {
    this.ctx = ctx;
    this.log = ctx.logger.child('game');
    this.wss = null;
    this.httpServer = null;
  }

  attachTo(server) { this.httpServer = server; }

  start() {
    this.wss = new WebSocket.Server({ noServer: true, perMessageDeflate: false });
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.log.success('GameServer /play WS dinliyor');
  }
  handleUpgrade(req, socket, head) {
    this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
  }

  stop() {
    if (this.wss) for (const c of this.wss.clients) c.close();
    if (this.wss) this.wss.close();
  }

  send(ws, obj) { try { ws.send(JSON.stringify(obj), { compress: false, binary: false }); } catch {} }

  async handleConnection(ws, req) {
    const ip = req.socket.remoteAddress;
    let player = null;

    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type === 'login') {
        const r = this.ctx.players.login(msg.name, msg.password);
        if (!r.ok) return this.send(ws, { type: 'login_error', error: r.error });
        if (this.ctx.bans.isBanned(r.player.name)) return this.send(ws, { type: 'login_error', error: 'Bu hesap yasakli.' });
        if (this.ctx.maintenance && r.player.role !== 'owner' && r.player.role !== 'admin') {
          return this.send(ws, { type: 'login_error', error: 'Sunucu bakimda.' });
        }
        if (this.ctx.players.online.has(r.player.key)) return this.send(ws, { type: 'login_error', error: 'Hesap zaten cevrimici.' });
        player = r.player;
        this.ctx.players.attachConnection(player, { ws, ip, send: (o) => this.send(ws, o) });
        this.send(ws, { type: 'login_ok', player: this.publicPlayer(player) });
        this.ctx.chat.system(`* ${player.name} sunucuya katildi`, 'global');
        const w = this.ctx.worlds.enter(player, player.world || 'START');
        this.send(ws, { type: 'world', world: this.publicWorld(w.world || this.ctx.worlds.get('START')) });
        this.send(ws, { type: 'motd', text: this.ctx.config.server.motd });
        return;
      }

      if (msg.type === 'register') {
        const r = this.ctx.players.register(msg.name, msg.password);
        if (!r.ok) return this.send(ws, { type: 'register_error', error: r.error });
        return this.send(ws, { type: 'register_ok' });
      }

      if (!player) return this.send(ws, { type: 'auth_required' });

      if (msg.type === 'chat') {
        const text = String(msg.text || '').slice(0, 200);
        if (text.startsWith('/')) {
          const res = await this.ctx.cmd.execute(player, text);
          this.send(ws, { type: 'cmdresult', text: res.text || (res.ok ? 'ok' : res.error) });
        } else {
          const r = this.ctx.chat.say(player, text);
          if (!r.ok) this.send(ws, { type: 'cmdresult', text: r.error });
        }
      }

      if (msg.type === 'move') {
        if (player.frozen) return;
        player.x = Math.max(0, Math.min(60, Number(msg.x) || 0));
        player.y = Math.max(0, Math.min(30, Number(msg.y) || 0));
        this.ctx.broadcastWorld(player.world, { type: 'move', name: player.name, x: player.x, y: player.y });
      }

      if (msg.type === 'place' || msg.type === 'break') {
        if (player.frozen) return;
        const w = this.ctx.worlds.get(player.world);
        if (!w) return;
        if (msg.type === 'place') {
          if (!player.inventory[msg.item]) return;
          w.blocks.push({ x: msg.x, y: msg.y, item: msg.item, by: player.name });
          this.ctx.players.removeItem(player, msg.item);
        } else {
          const i = w.blocks.findIndex(b => b.x === msg.x && b.y === msg.y);
          if (i >= 0) { const b = w.blocks[i]; w.blocks.splice(i, 1); this.ctx.players.addItem(player, b.item); }
        }
        this.ctx.db.mark('worlds');
        this.ctx.broadcastWorld(player.world, { type: 'world', world: this.publicWorld(w) });
      }
    });

    ws.on('close', () => {
      if (player) {
        this.ctx.chat.system(`* ${player.name} sunucudan ayrildi`, 'global');
        this.ctx.worlds.leave(player);
        this.ctx.players.detachConnection(player);
      }
    });

    this.send(ws, { type: 'hello', server: this.ctx.config.server.name, motd: this.ctx.config.server.motd });
  }

  publicPlayer(p) {
    return { name: p.name, role: p.role, gems: p.gems, level: p.level, xp: p.xp, world: p.world, x: p.x, y: p.y, health: p.health, inventory: p.inventory, equipped: p.equipped, title: p.title };
  }
  publicWorld(w) {
    return { name: w.name, owner: w.owner, players: w.players, blocks: w.blocks, spawn: w.spawn, width: w.width || 60, height: w.height || 30, special: w.special || null };
  }
}

module.exports = GameServer;
