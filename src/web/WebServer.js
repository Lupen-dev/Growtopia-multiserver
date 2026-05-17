const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
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
    // GT istemcisi isteklerini detayli logla (sorun gidermek icin)
    this.app.use((req, res, next) => {
      const ua = req.get('user-agent') || '';
      const isGT = /growtopia|ubiservices/i.test(ua) || req.path.startsWith('/growtopia/') || req.path.startsWith('/player/login') || req.path.startsWith('/cache/') || req.path.startsWith('/ubi');
      if (isGT) {
        const bodyPreview = req.method === 'POST'
          ? ' body=' + JSON.stringify(req.body || {}).slice(0, 200)
          : '';
        this.log.info(`[GT-HTTP] ${req.method} ${req.originalUrl} ua="${ua.slice(0,60)}"${bodyPreview}`);
      }
      next();
    });
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.setupRoutes();
    this.server = http.createServer(this.app);
    this.httpsServer = null;
    this.adminWss = null;
    this.playerSessions = new Map(); // token -> { key, until }
    this.loginTokens = new Map();    // gt client login tokens
  }

  newPlayerToken(player) {
    const crypto = require('crypto');
    const t = crypto.randomBytes(24).toString('hex');
    this.playerSessions.set(t, { key: player.key, until: Date.now() + this.ctx.config.web.sessionTtlHours * 3600 * 1000 });
    return t;
  }
  validatePlayerToken(t) {
    if (!t) return null;
    const s = this.playerSessions.get(t);
    if (!s) return null;
    if (s.until < Date.now()) { this.playerSessions.delete(t); return null; }
    return this.ctx.players.data.players[s.key] || null;
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

    // --- Oyuncu hesap (HTML login/register) API ---
    const requirePlayer = (req, res, next) => {
      const t = req.headers['x-player-token'] || req.query.token;
      const p = this.validatePlayerToken(t);
      if (!p) return res.status(401).json({ ok: false, error: 'Giris yapmalisin.' });
      req.player = p; req.playerToken = t;
      next();
    };

    app.post('/api/account/register', (req, res) => {
      const { username, password } = req.body || {};
      const r = ctx.players.register(username || '', password || '');
      if (!r.ok) return res.status(400).json(r);
      const token = this.newPlayerToken(r.player);
      ctx.audit.record('account.register', r.player.name);
      res.json({ ok: true, token, username: r.player.name });
    });

    app.post('/api/account/login', (req, res) => {
      const { username, password } = req.body || {};
      const r = ctx.players.login(username || '', password || '');
      if (!r.ok) return res.status(401).json(r);
      if (ctx.bans.isBanned(r.player.name)) return res.status(403).json({ ok: false, error: 'Hesap yasakli.' });
      const token = this.newPlayerToken(r.player);
      ctx.audit.record('account.login', r.player.name);
      res.json({ ok: true, token, username: r.player.name, role: r.player.role });
    });

    app.post('/api/account/logout', requirePlayer, (req, res) => {
      this.playerSessions.delete(req.playerToken);
      res.json({ ok: true });
    });

    app.get('/api/account/me', requirePlayer, (req, res) => {
      const p = req.player;
      const { passwordHash, salt, conn, ...safe } = p;
      const itemsMap = {};
      for (const id of Object.keys(p.inventory)) {
        const it = ctx.items.get(id); if (it) itemsMap[id] = { name: it.name, rarity: it.rarity, category: it.category };
      }
      res.json({ ok: true, player: safe, xpNext: ctx.players.xpForNext(p), items: itemsMap });
    });

    app.post('/api/account/password', requirePlayer, (req, res) => {
      const { oldPassword, newPassword } = req.body || {};
      const check = ctx.players.login(req.player.name, oldPassword || '');
      if (!check.ok) return res.status(400).json({ ok: false, error: 'Mevcut sifre yanlis.' });
      if (!newPassword || newPassword.length < 4) return res.status(400).json({ ok: false, error: 'Yeni sifre en az 4 karakter.' });
      ctx.players.changePassword(req.player, newPassword);
      ctx.audit.record('account.password', req.player.name);
      res.json({ ok: true });
    });

    // GrowID akisi (GT istemcisinin set_url ile actigi sayfanin postback'i)
    // GT istemcisi 'redirect' parametresi ile token bekler, frontend yonlendirir.
    app.get('/growid/login', (req, res) => res.redirect('/login?return=' + encodeURIComponent(req.query.redirect || '/account')));

    // --- HTML sayfa rotalari ---
    app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
    app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
    app.get('/account', (req, res) => res.sendFile(path.join(__dirname, 'public', 'account.html')));

    // GT istemcisinin baglandigi server_data endpoint'i (HTTPS bekler).
    // Modern protokol 225 (GT 5.45+): loginurl varsa WebView dashboard'u acar.
    app.all('/growtopia/server_data.php', (req, res) => {
      const cfg = ctx.config.network;
      const gameHost = cfg.publicHost || (cfg.gameHost === '0.0.0.0' ? '127.0.0.1' : cfg.gameHost);
      const loginDomain = cfg.loginDomain || 'www.growtopia1.com';
      if (req.body && req.body.protocol) {
        this.log.info(`[GT-CLIENT] version=${req.body.version} protocol=${req.body.protocol} platform=${req.body.platform}`);
      }
      const body =
        `server|${gameHost}\n` +
        `port|${cfg.gamePort}\n` +
        `type|1\n` +
        `#maint|server is under maintenance\n` +
        `beta_server|${gameHost}\n` +
        `beta_port|${cfg.gamePort}\n` +
        `beta_type|1\n` +
        `meta|undefined\n` +
        `loginurl|${loginDomain}\n` +
        `RTENDMARKERBS1001`;
      res.set({
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }).send(body);
    });

    // Modern GT istemcisi UbiServices ile bazen ek endpoint'ler ister.
    app.get('/growtopia/cache/*', (req, res) => {
      const cachePath = path.join(__dirname, '..', '..', 'data', 'cache', req.path.replace('/growtopia/cache/', ''));
      if (fs.existsSync(cachePath)) return res.sendFile(cachePath);
      res.status(200).set('Content-Type', 'application/octet-stream').send(Buffer.alloc(0));
    });
    app.get('/growtopia/version.php', (req, res) => res.send('100'));
    app.all('/ubiservices/*', (req, res) => res.json({ status: 'success' }));
    app.all('/growtopia/*', (req, res, next) => {
      this.log.warn(`[GT-HTTP] BILINMEYEN endpoint: ${req.method} ${req.originalUrl}`);
      res.status(200).send('');
    });

    // ============================================================
    // GT istemcisi WebView login akisi (protokol 225 / GT 5.45+)
    // Referans: YoruAkio/GTLogin, StileDevs/GrowServer
    // ============================================================
    //
    // 1) GT istemcisi POST /player/login/dashboard yollar; body'de
    //    pipe-delimited client bilgileri var (tankIDName, requestedName,
    //    protocol, platform vs). Server bu body'yi base64'le encode edip
    //    HTML template'inde {{ data }} yerine yapistirir, _token hidden
    //    alani olarak doner.
    // 2) Kullanici growId/sifre girer -> POST /player/growid/login/validate
    // 3) Server validate eder, ENet token'i (base64) doner.
    // 4) GT istemcisi WebView'i kapatir, ENet uzerinden token ile login.
    //
    const dashboardTemplatePath = path.join(__dirname, 'public', 'gt_dashboard.html');

    function buildClientDataString(reqBody) {
      // GT istemcisi pipe-delimited body yolluyor; express.urlencoded
      // bunu key=value seklinde parse ediyor.
      // Geri ceviriyoruz: key|value\n formatina.
      if (!reqBody || typeof reqBody !== 'object') return '';
      const lines = [];
      for (const [k, v] of Object.entries(reqBody)) {
        if (v === undefined || v === null) continue;
        lines.push(`${k}|${v}`);
      }
      return lines.join('\n');
    }

    app.all('/player/login/dashboard', (req, res) => {
      const clientData = buildClientDataString(req.body);
      const encoded = Buffer.from(clientData, 'utf8').toString('base64');
      this.log.info(`[GT-LOGIN] dashboard request, client data keys=${Object.keys(req.body || {}).join(',')}`);
      try {
        let html = fs.readFileSync(dashboardTemplatePath, 'utf8');
        html = html.replace(/\{\{\s*data\s*\}\}/g, encoded);
        res.set('Content-Type', 'text/html').send(html);
      } catch (e) {
        this.log.error('dashboard template hatasi: ' + e.message);
        res.status(500).send('Template error');
      }
    });

    app.all('/player/growid/login/validate', (req, res) => {
      const growId = (req.body.growId || req.body.growID || '').trim();
      const password = req.body.password || '';
      const _token = req.body._token || '';

      this.log.info(`[GT-LOGIN] /validate growId=${growId} hasToken=${!!_token} hasPass=${!!password}`);

      if (!growId || !password) {
        return res.json({ status: 'error', message: 'Eksik bilgi (growId/password).' });
      }

      let r = ctx.players.login(growId, password);
      if (!r.ok && r.error === 'Oyuncu bulunamadi.') {
        r = ctx.players.register(growId, password);
      }
      if (!r.ok) {
        return res.json({ status: 'error', message: r.error });
      }

      // ENet'in kabul edecegi token: base64(_token + growId + password + reg=0)
      // GT istemcisi bu token'i alip ENet uzerinden geri yollar.
      const tokenPayload = `_token|${_token}\ngrowId|${growId}\npassword|${password}\nreg|0`;
      const token = Buffer.from(tokenPayload, 'utf8').toString('base64');

      const until = Date.now() + 10 * 60000;
      this.loginTokens.set(token, { key: r.player.key, until });
      ctx.gtLoginTokens.set(token, { key: r.player.key, growID: growId, until });
      ctx.gtLoginTokens.set(`growid:${growId.toLowerCase()}`, { key: r.player.key, growID: growId, until });
      ctx.audit.record('gt.login', growId);
      this.log.success(`[GT-LOGIN] dogrulama OK: ${growId}`);

      res.json({
        status: 'success',
        message: 'Account Validated.',
        token,
        url: '',
        accountType: 'growtopia'
      });
    });

    // Token tazeleme (GT istemcisi reconnect denerken kullanir)
    app.all('/player/growid/checktoken', (req, res) => {
      res.redirect(307, '/player/growid/validate/checktoken');
    });
    app.all('/player/growid/validate/checktoken', (req, res) => {
      const refreshToken = req.body.refreshToken || '';
      const clientData = req.body.clientData || '';
      try {
        let decoded = Buffer.from(refreshToken, 'base64').toString('utf8');
        decoded = decoded.replace(/&reg=[01]/g, '');
        const newClientB64 = Buffer.from(clientData, 'utf8').toString('base64');
        decoded = decoded.replace(/_token\|[^\n]*/, `_token|${newClientB64}`);
        const token = Buffer.from(decoded, 'utf8').toString('base64');
        res.json({ status: 'success', message: 'Refresh Token.', token, url: '', accountType: 'growtopia' });
      } catch (e) {
        res.json({ status: 'error', message: 'Token decode hatasi.' });
      }
    });

    // Geriye uyumluluk: eski /player/login/validate'i de yeni endpoint'e yonlendir
    app.all('/player/login/validate', (req, res) => {
      // GT istemcisi yeni protokolde /player/growid/login/validate kullanir
      this.log.warn('[GT-LOGIN] Eski /player/login/validate cagrildi -> yeni endpoint\'e yonleniyor');
      res.redirect(307, '/player/growid/login/validate');
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

  // ENet sunucusu bunu kullanir: HTTPS login dashboard'tan gelen token'i dogrular.
  consumeLoginToken(token) {
    const t = this.loginTokens.get(token);
    if (!t) return null;
    if (t.until < Date.now()) { this.loginTokens.delete(token); return null; }
    this.loginTokens.delete(token);
    return this.ctx.players.data.players[t.key] || null;
  }

  listen(port, host) {
    return new Promise(resolve => {
      this.server.listen(port, host, () => {
        this.log.success(`HTTP: http://${host}:${port}/admin (oyun: /play)`);
        resolve();
      });
    });
  }

  startHttps() {
    const cfg = this.ctx.config.network;
    const sslDir = path.resolve(__dirname, '..', '..', 'data', 'runtime', 'ssl');
    const keyPath = path.join(sslDir, 'server.key');
    const crtPath = path.join(sslDir, 'server.crt');
    if (!fs.existsSync(keyPath) || !fs.existsSync(crtPath)) {
      this.log.warn('SSL sertifikalari yok. HTTPS basliyamayacak. `npm run gen-cert` calistirin.');
      return Promise.resolve(false);
    }
    const opts = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(crtPath) };
    const tryPort = (port) => new Promise(resolve => {
      const srv = https.createServer(opts, this.app);
      srv.once('error', (e) => resolve({ ok: false, error: e, port }));
      srv.listen(port, cfg.webHost, () => resolve({ ok: true, server: srv, port }));
    });

    const primary = cfg.loginPort || 443;
    const fallback = cfg.loginPortFallback || 8443;

    return tryPort(primary).then(async (r) => {
      if (r.ok) {
        this.httpsServer = r.server;
        this.log.success(`HTTPS (GT login): https://${cfg.webHost}:${r.port}/player/login/dashboard`);
        if (r.port !== 443) this.log.warn(`GT istemcisi 443 bekler. Su an ${r.port}. Yonlendirme icin: ./scripts/portfwd.sh ${r.port}`);
        return true;
      }
      if (r.error.code === 'EACCES' && primary < 1024) {
        this.log.warn(`Port ${primary} icin root yetkisi gerekli. ${fallback}'a dusuluyor...`);
        const r2 = await tryPort(fallback);
        if (r2.ok) {
          this.httpsServer = r2.server;
          this.log.success(`HTTPS (fallback): https://${cfg.webHost}:${r2.port}/player/login/dashboard`);
          this.log.warn('!! GT istemcisi 443 bekler !! Iki secenek var:');
          this.log.warn(`   1) Port yonlendirme: ./scripts/portfwd.sh ${r2.port}  (sudo, bir kere)`);
          this.log.warn(`   2) Sudo ile baslat: sudo ./start.sh                  (her seferinde)`);
          return true;
        }
        this.log.error('HTTPS fallback de basarisiz: ' + (r2.error && r2.error.message));
        return false;
      }
      this.log.error('HTTPS baslamadi: ' + r.error.message);
      return false;
    });
  }

  stop() {
    if (this.adminWss) for (const c of this.adminWss.clients) c.close();
    if (this.adminWss) this.adminWss.close();
    this.server.close();
    if (this.httpsServer) this.httpsServer.close();
  }
}

module.exports = WebServer;
