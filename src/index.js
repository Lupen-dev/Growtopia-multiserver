#!/usr/bin/env node
const path = require('path');
const fs = require('fs');

const Logger = require('./core/Logger');
const Database = require('./core/Database');
const PlayerManager = require('./core/PlayerManager');
const WorldManager = require('./core/WorldManager');
const ItemManager = require('./core/ItemManager');
const EconomyManager = require('./core/EconomyManager');
const ChatManager = require('./core/ChatManager');
const BanManager = require('./core/BanManager');
const AuditLog = require('./core/AuditLog');
const CommandHandler = require('./core/CommandHandler');
const EventManager = require('./core/EventManager');
const ActivityManager = require('./core/ActivityManager');
const ConsoleUI = require('./core/Console');

const Casino = require('./activities/Casino');
const Fishing = require('./activities/Fishing');
const Mining = require('./activities/Mining');
const Farming = require('./activities/Farming');
const Lottery = require('./activities/Lottery');
const Quiz = require('./activities/Quiz');
const Parkour = require('./activities/Parkour');
const PvP = require('./activities/PvP');
const TreasureHunt = require('./activities/TreasureHunt');
const BossRaid = require('./activities/BossRaid');

const registerAllCommands = require('./commands/registry');
const GameServer = require('./network/GameServer');
const ENetServer = require('./network/ENetServer');
const WebServer = require('./web/WebServer');

async function main() {
  const ROOT = path.resolve(__dirname, '..');
  const CONFIG_PATH = path.join(ROOT, 'config', 'default.json');
  const RUNTIME = path.join(ROOT, 'data', 'runtime');
  const logger = new Logger('server', path.join(ROOT, 'logs'));

  logger.info('============================================================');
  logger.info(' GrowTurk MultiServer baslatiliyor...');
  logger.info('============================================================');

  if (!fs.existsSync(RUNTIME) || !fs.existsSync(path.join(RUNTIME, 'items.json'))) {
    logger.warn('Runtime veritabani yok, ilk tohumlama yapiliyor...');
    require(path.join(ROOT, 'scripts', 'seed.js'));
  }

  let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const db = new Database(RUNTIME, logger);

  const items = new ItemManager(db, logger);
  const bans = new BanManager(db, logger);
  const players = new PlayerManager(db, config, logger);
  const worlds = new WorldManager(db, logger);
  const economy = new EconomyManager(db, config, logger);
  const chat = new ChatManager(db, config, logger, bans);
  const audit = new AuditLog(db, logger);
  const events = new EventManager({ config, logger, chat });
  const activities = new ActivityManager({ config, logger });

  const ctx = {
    startedAt: Date.now(), config, logger, db,
    items, players, worlds, economy, chat, bans, audit, events, activities,
    cmd: null, console: null, gameServer: null, webServer: null,
    maintenance: false,
    broadcast(obj) {
      if (this.gameServer && this.gameServer.wss) {
        const data = JSON.stringify(obj);
        for (const c of this.gameServer.wss.clients) if (c.readyState === 1) c.send(data);
      }
    },
    broadcastWorld(name, obj) {
      const data = JSON.stringify(obj);
      for (const p of this.players.online_list()) {
        if (p.world === name && p.conn && p.conn.ws.readyState === 1) p.conn.ws.send(data);
      }
    },
    broadcastToMods(obj) {
      const data = JSON.stringify(obj);
      for (const p of this.players.online_list()) {
        if (['mod', 'admin', 'owner'].includes(p.role) && p.conn && p.conn.ws.readyState === 1) p.conn.ws.send(data);
      }
    },
    kick(player, reason) {
      if (player && player.conn) {
        try { player.conn.send({ type: 'kicked', reason }); player.conn.ws.close(); } catch {}
      }
      if (ctx.enetServer) ctx.enetServer.kick(player, reason);
    },
    reloadConfig() {
      try {
        const newCfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        Object.assign(ctx.config, newCfg);
        logger.info('Konfig yeniden yuklendi.');
      } catch (e) { logger.error('Konfig okunamadi', { err: e.message }); }
    },
    shutdown(restart = false) {
      logger.info('Kapatma sirasi calisiyor...');
      events.stopAll(); activities.stopAll();
      if (ctx.gameServer) ctx.gameServer.stop();
      if (ctx.enetServer) ctx.enetServer.stop();
      if (ctx.webServer) ctx.webServer.stop();
      db.stop();
      logger.success('Kapatildi.');
      process.exit(restart ? 2 : 0);
    }
  };

  events.ctx = ctx; activities.ctx = ctx;

  // Aktiviteleri kaydet
  activities.register('casino', new Casino());
  activities.register('fishing', new Fishing());
  activities.register('mining', new Mining());
  activities.register('farming', new Farming());
  activities.register('lottery', new Lottery());
  activities.register('quiz', new Quiz());
  activities.register('parkour', new Parkour());
  activities.register('pvp', new PvP());
  activities.register('treasure', new TreasureHunt());
  activities.register('bossraid', new BossRaid());

  // GT WebView login token'lari (WebServer ile ENetServer arasinda paylasilir)
  ctx.gtLoginTokens = new Map();

  // Komutlari kaydet
  ctx.cmd = new CommandHandler(ctx);
  registerAllCommands(ctx.cmd);
  logger.success(`${ctx.cmd.list().length} komut yuklendi.`);

  // Konsol
  ctx.console = new ConsoleUI(ctx);

  // Network
  ctx.webServer = new WebServer(ctx);
  ctx.gameServer = new GameServer(ctx);
  ctx.gameServer.attachTo(ctx.webServer.server);

  await ctx.webServer.listen(config.network.webPort, config.network.webHost);
  ctx.gameServer.start();
  ctx.webServer.startAdminWs();
  ctx.webServer.routeUpgrades();
  await ctx.webServer.startHttps();

  // ENet Growtopia sunucusu (gercek GT istemcisi icin)
  if (config.network.gameEnetEnabled !== false) {
    try {
      // GT items.dat (assets/items.dat varsa yukle, yoksa minimal uret)
      const GTItems = require('./network/GTItems');
      ctx.gtItems = await new GTItems(ctx).load();
      ctx.enetServer = new ENetServer(ctx);
      await ctx.enetServer.start(config.network.gamePort, config.network.gameHost);
    } catch (e) {
      logger.error('ENet sunucusu baslatilamadi: ' + e.message);
      logger.warn('Sunucu yine de WebSocket istemcisi (/play) ile calismaya devam edecek.');
    }
  }

  // Etkinlik zamanlayicilari
  events.schedule();
  activities.schedulePeriodic();

  // Otomatik kayit
  db.startAutoSave(15000);

  // SIGINT
  process.on('SIGINT', () => ctx.shutdown());
  process.on('SIGTERM', () => ctx.shutdown());

  // Konsolu en sonda baslat (cikti karismasin)
  setTimeout(() => {
    logger.success('============================================================');
    logger.success(` ${config.server.name} HAZIR`);
    logger.success(` Web/Oyna: http://${config.network.webHost === '0.0.0.0' ? 'localhost' : config.network.webHost}:${config.network.webPort}/play`);
    logger.success(` Admin:    http://${config.network.webHost === '0.0.0.0' ? 'localhost' : config.network.webHost}:${config.network.webPort}/admin`);
    logger.success(` Komutlar: ${ctx.cmd.list().length}  Aktiviteler: ${activities.list().length}  Dunyalar: ${worlds.count()}`);
    logger.success('============================================================');
    logger.info("Konsol acik. 'help' yaz.");
    ctx.console.start();
  }, 200);
}

main().catch(e => { console.error('Onyukleme hatasi:', e); process.exit(1); });
