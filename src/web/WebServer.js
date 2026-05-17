const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const WebAuth = require('./auth');
const Perms = require('../core/Permissions');

class WebServer {
  constructor(ctx) {
    this.ctx = ctx;
    this.log = ctx.logger.child('web');
    this.app = express();
    this.auth = new WebAuth(ctx.db, ctx.config, ctx.logger);
    this.app.use(express.json({ limit: '256kb' }));
    this.app.use(express.urlencoded({ extended: false }));
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.setupRoutes();
    this.server = http.createServer(this.app);
    this.adminWss = null;
  }

  setupRoutes() {
    const app = this.app;
    const ctx = this.ctx;

    const requireAuth = (minRole = 'mod') => (req, res, next) => {
      const token = req.headers['x-auth'] || req.query.token;
      const sess = token && this.auth.validate(token);
      if (!sess) return res.status(401).json({ error: 'auth required' });
      if (!Perms.atLeast(sess.role, minRole)) return res.status(403).json({ error: 'forbidden' });
      req.session = sess;
      next();
    };

    app.post('/api/login', (req, res) => {
      const r = this.auth.login(req.body.username, req.body.password);
      if (!r.ok) return res.status(401).json(r);
      this.ctx.audit.record('web.login', r.username, null, { role: r.role });
      res.json(r);
    });

    app.post('/api/logout', (req, res) => {
      const token = req.headers['x-auth'];
      if (token) this.auth.logout(token);
      res.json({ ok: true });
    });

    app.post('/api/change-password', requireAuth('mod'), (req, res) => {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'En az 6 karakter.' });
      this.auth.changePassword(req.session.username, newPassword);
      this.ctx.audit.record('web.passchange', req.session.username);
      res.json({ ok: true });
    });

    app.get('/api/me', requireAuth('mod'), (req, res) => res.json({ ok: true, session: req.session }));

    app.get('/api/dashboard', requireAuth('mod'), (req, res) => {
      const mem = process.memoryUsage();
      res.json({
        server: ctx.config.server.name,
        motd: ctx.config.server.motd,
        online: ctx.players.onlineCount(),
        totalPlayers: ctx.players.count(),
        worldCount: ctx.worlds.count(),
        uptimeMs: Date.now() - ctx.startedAt,
        activeEvents: ctx.events.listActive(),
        memoryMB: { rss: (mem.rss / 1024 / 1024).toFixed(1), heap: (mem.heapUsed / 1024 / 1024).toFixed(1) },
        maintenance: !!ctx.maintenance,
        lotteryPot: ctx.economy.data.lotteryPot,
        ticketCount: ctx.economy.data.lotteryTickets.length
      });
    });

    app.get('/api/players', requireAuth('mod'), (req, res) => {
      const q = (req.query.q || '').toString();
      const onlineOnly = req.query.online === '1';
      let list = q ? ctx.players.search(q, 200) : ctx.players.all();
      if (onlineOnly) list = list.filter(p => ctx.players.online.has(p.key));
      res.json(list.slice(0, 200).map(p => ({
        name: p.name, role: p.role, gems: p.gems, level: p.level, xp: p.xp,
        world: p.world, health: p.health, online: ctx.players.online.has(p.key),
        lastSeen: p.lastSeen, warns: p.warns, clan: p.clan
      })));
    });

    app.get('/api/players/:name', requireAuth('mod'), (req, res) => {
      const p = ctx.players.get(req.params.name);
      if (!p) return res.status(404).json({ error: 'yok' });
      const { passwordHash, salt, conn, ...safe } = p;
      res.json({ ...safe, online: ctx.players.online.has(p.key) });
    });

    app.post('/api/players/:name/action', requireAuth('mod'), (req, res) => {
      const p = ctx.players.get(req.params.name); if (!p) return res.status(404).json({ error: 'yok' });
      const { action, value, mins, reason } = req.body;
      const by = req.session.username;
      switch (action) {
        case 'kick': ctx.kick && p.conn && ctx.kick(p, reason || 'web'); break;
        case 'ban': ctx.bans.ban(p.name, by, reason || '', mins || null); if (p.conn) ctx.kick(p, 'banlandi'); break;
        case 'unban': ctx.bans.unban(p.name); break;
        case 'mute': ctx.bans.mute(p.name, by, reason || '', mins || 10); break;
        case 'unmute': ctx.bans.unmute(p.name); break;
        case 'jail': ctx.bans.jail(p.name, by, reason || '', mins || 30); break;
        case 'unjail': ctx.bans.unjail(p.name); break;
        case 'setrole':
          if (!Perms.atLeast(req.session.role, 'admin')) return res.status(403).json({ error: 'admin gerekli' });
          ctx.players.setRole(p, value); break;
        case 'setgems':
          if (!Perms.atLeast(req.session.role, 'admin')) return res.status(403).json({ error: 'admin gerekli' });
          p.gems = Math.max(0, Number(value)); ctx.db.mark('players'); break;
        case 'addgems':
          if (!Perms.atLeast(req.session.role, 'admin')) return res.status(403).json({ error: 'admin gerekli' });
          ctx.economy.add(p, Number(value)); break;
        case 'setlevel':
          if (!Perms.atLeast(req.session.role, 'admin')) return res.status(403).json({ error: 'admin gerekli' });
          p.level = Math.max(1, Number(value)); ctx.db.mark('players'); break;
        case 'reset':
          if (!Perms.atLeast(req.session.role, 'admin')) return res.status(403).json({ error: 'admin gerekli' });
          p.gems = 0; p.level = 1; p.xp = 0; p.inventory = {}; ctx.db.mark('players'); break;
        case 'warn': p.warns = (p.warns || 0) + 1; ctx.db.mark('players'); break;
        case 'unwarn': p.warns = 0; ctx.db.mark('players'); break;
        default: return res.status(400).json({ error: 'bilinmeyen aksiyon' });
      }
      ctx.audit.record('web.' + action, by, p.name, { value, mins, reason });
      res.json({ ok: true });
    });

    app.get('/api/worlds', requireAuth('mod'), (req, res) => {
      res.json(ctx.worlds.list().map(w => ({ name: w.name, owner: w.owner, visits: w.visits, players: w.players, locked: w.locked, special: w.special, blocks: w.blocks.length })));
    });
    app.post('/api/worlds', requireAuth('admin'), (req, res) => {
      const r = ctx.worlds.create(req.body.name, 'SYSTEM');
      if (!r.ok) return res.status(400).json(r);
      ctx.audit.record('web.worldcreate', req.session.username, r.world.name);
      res.json({ ok: true });
    });
    app.delete('/api/worlds/:name', requireAuth('admin'), (req, res) => {
      const ok = ctx.worlds.remove(req.params.name);
      if (ok) ctx.audit.record('web.worlddel', req.session.username, req.params.name);
      res.json({ ok });
    });

    app.get('/api/items', requireAuth('mod'), (req, res) => res.json(ctx.items.list()));

    app.get('/api/audit', requireAuth('mod'), (req, res) => res.json(ctx.audit.recent(Number(req.query.n || 200))));

    app.get('/api/chat', requireAuth('mod'), (req, res) => res.json(ctx.chat.recent(Number(req.query.n || 100))));

    app.get('/api/events', requireAuth('mod'), (req, res) => res.json({ active: ctx.events.listActive(), all: ctx.events.events }));
    app.post('/api/events/:id/start', requireAuth('admin'), (req, res) => {
      const ok = ctx.events.start(req.params.id);
      if (ok) ctx.audit.record('web.eventstart', req.session.username, req.params.id);
      res.json({ ok });
    });
    app.post('/api/events/:id/stop', requireAuth('admin'), (req, res) => {
      const ok = ctx.events.stop(req.params.id);
      if (ok) ctx.audit.record('web.eventstop', req.session.username, req.params.id);
      res.json({ ok });
    });

    app.post('/api/console', requireAuth('owner'), async (req, res) => {
      const line = (req.body.line || '').trim();
      if (!line) return res.json({ ok: false, text: 'bos' });
      const captured = [];
      const origLog = console.log;
      console.log = (...args) => captured.push(args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' '));
      try { await ctx.console.handle(line); }
      finally { console.log = origLog; }
      ctx.audit.record('web.console', req.session.username, null, { line });
      res.json({ ok: true, text: captured.join('\n') });
    });

    app.post('/api/broadcast', requireAuth('mod'), (req, res) => {
      const text = (req.body.text || '').toString().slice(0, 500);
      ctx.chat.system('[Web] ' + text, 'global');
      ctx.broadcast && ctx.broadcast({ type: 'announce', text, source: 'web/' + req.session.username });
      ctx.audit.record('web.broadcast', req.session.username, null, { text });
      res.json({ ok: true });
    });

    app.get('/api/bans', requireAuth('mod'), (req, res) => res.json(ctx.bans.list()));

    app.get('/api/economy/top', requireAuth('mod'), (req, res) => {
      res.json(ctx.economy.topRich(ctx.players, 25).map(p => ({ name: p.name, gems: p.gems, level: p.level })));
    });

    app.get('/api/webusers', requireAuth('owner'), (req, res) =>
      res.json(this.auth.data.users.map(u => ({ username: u.username, role: u.role, createdAt: u.createdAt }))));
    app.post('/api/webusers', requireAuth('owner'), (req, res) => {
      const r = this.auth.create(req.body.username, req.body.password, req.body.role || 'mod');
      if (!r.ok) return res.status(400).json(r);
      ctx.audit.record('web.usercreate', req.session.username, req.body.username);
      res.json({ ok: true });
    });
    app.delete('/api/webusers/:name', requireAuth('owner'), (req, res) => {
      const ok = this.auth.remove(req.params.name);
      if (ok) ctx.audit.record('web.userdel', req.session.username, req.params.name);
      res.json({ ok });
    });

    // GT istemcisinin baglandigi server_data endpoint'i (HTTP)
    app.all('/growtopia/server_data.php', (req, res) => {
      const cfg = ctx.config.network;
      const reachableHost = cfg.gameHost === '0.0.0.0' ? '127.0.0.1' : cfg.gameHost;
      const body = [
        'server|' + reachableHost,
        'port|' + cfg.gamePort,
        'type|1',
        'beta_server|' + reachableHost,
        'beta_port|' + cfg.gamePort,
        'beta_type|1',
        'meta|growturk',
        'RTENDMARKERBS1001'
      ].join('\n');
      res.set('Content-Type', 'text/plain').send(body);
    });

    app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
    app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
    app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'public', 'play.html')));
  }

  startAdminWs() {
    this.adminWss = new WebSocket.Server({ noServer: true, perMessageDeflate: false });
    this.adminWss.on('connection', (ws, req) => {
      const u = new URL(req.url, 'http://x'); const token = u.searchParams.get('token');
      const sess = this.auth.validate(token);
      if (!sess) { ws.close(); return; }
      ws.session = sess;
      ws.on('message', () => { });
    });
    this.routeUpgrades();

    const broadcastAdmin = (obj) => {
      const data = JSON.stringify(obj);
      if (!this.adminWss) return;
      for (const c of this.adminWss.clients) if (c.readyState === 1) c.send(data);
    };

    this.ctx.chat.subscribe(entry => broadcastAdmin({ kind: 'chat', entry }));
    this.ctx.logger.onLine(line => broadcastAdmin({ kind: 'log', line }));
  }

  routeUpgrades() {
    if (this._routed) return;
    this._routed = true;
    this.server.on('upgrade', (req, socket, head) => {
      const url = req.url.split('?')[0];
      if (url === '/play' && this.ctx.gameServer && this.ctx.gameServer.wss) {
        this.ctx.gameServer.handleUpgrade(req, socket, head);
      } else if (url === '/wsadmin' && this.adminWss) {
        this.adminWss.handleUpgrade(req, socket, head, (ws) => this.adminWss.emit('connection', ws, req));
      } else {
        socket.destroy();
      }
    });
  }

  listen(port, host) {
    return new Promise(resolve => {
      this.server.listen(port, host, () => {
        this.log.success(`Web paneli http://${host}:${port}/admin (oyun istemcisi: /play)`);
        resolve();
      });
    });
  }

  stop() {
    if (this.adminWss) for (const c of this.adminWss.clients) c.close();
    if (this.adminWss) this.adminWss.close();
    this.server.close();
  }
}

module.exports = WebServer;
