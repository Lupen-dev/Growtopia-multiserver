// Sunucuyu calistirmadan (scriptler/testler icin) salt-okunur bir ctx kurar.
// Ayni data/runtime dosyalarini okur; hicbir sey kaydetmez.
const path = require('path');
const fs = require('fs');
const Logger = require('../core/Logger');
const Database = require('../core/Database');
const PlayerManager = require('../core/PlayerManager');
const WorldManager = require('../core/WorldManager');
const EconomyManager = require('../core/EconomyManager');
const ChatManager = require('../core/ChatManager');
const BanManager = require('../core/BanManager');
const AuditLog = require('../core/AuditLog');

function createStandaloneCtx(root) {
  const ROOT = root || path.resolve(__dirname, '..', '..');
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'default.json'), 'utf8'));
  const logger = new Logger('jarvis-cli', path.join(ROOT, 'logs'));
  const db = new Database(path.join(ROOT, 'data', 'runtime'), logger);
  const bans = new BanManager(db, logger);
  const players = new PlayerManager(db, config, logger);
  const worlds = new WorldManager(db, logger);
  const economy = new EconomyManager(db, config, logger);
  const chat = new ChatManager(db, config, logger, bans);
  const audit = new AuditLog(db, logger);
  const events = { listActive: () => [] };
  return { ROOT, startedAt: Date.now(), config, logger, db, players, worlds, economy, chat, bans, audit, events, maintenance: false };
}

module.exports = { createStandaloneCtx };
