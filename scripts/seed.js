#!/usr/bin/env node
// Veritabanini sifirdan tohumla (items, varsayilan admin, demo dunyalar).
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const RUNTIME = path.join(ROOT, 'data', 'runtime');

if (!fs.existsSync(RUNTIME)) fs.mkdirSync(RUNTIME, { recursive: true });

const itemsSeed = require(path.join(ROOT, 'data', 'items.seed.json'));
fs.writeFileSync(path.join(RUNTIME, 'items.json'), JSON.stringify(itemsSeed, null, 2));

const config = require(path.join(ROOT, 'config', 'default.json'));

const crypto = require('crypto');
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');
const salt = crypto.randomBytes(8).toString('hex');

const adminUser = {
  username: config.admin.defaultUsername,
  passwordHash: hash(config.admin.defaultPassword, salt),
  salt,
  role: 'owner',
  createdAt: Date.now()
};

fs.writeFileSync(path.join(RUNTIME, 'webusers.json'), JSON.stringify({ users: [adminUser] }, null, 2));

const demoWorlds = {
  worlds: [
    { name: 'START', owner: 'SYSTEM', visits: 0, blocks: [], spawn: { x: 5, y: 10 }, locked: false, public: true },
    { name: 'CASINO', owner: 'SYSTEM', visits: 0, blocks: [], spawn: { x: 4, y: 6 }, locked: false, public: true, special: 'casino' },
    { name: 'MARKET', owner: 'SYSTEM', visits: 0, blocks: [], spawn: { x: 4, y: 6 }, locked: false, public: true, special: 'market' },
    { name: 'ARENA', owner: 'SYSTEM', visits: 0, blocks: [], spawn: { x: 4, y: 6 }, locked: false, public: true, special: 'arena' },
    { name: 'PARKOUR', owner: 'SYSTEM', visits: 0, blocks: [], spawn: { x: 2, y: 22 }, locked: false, public: true, special: 'parkour' },
    { name: 'FISHING', owner: 'SYSTEM', visits: 0, blocks: [], spawn: { x: 4, y: 6 }, locked: false, public: true, special: 'fishing' },
    { name: 'MINE', owner: 'SYSTEM', visits: 0, blocks: [], spawn: { x: 4, y: 6 }, locked: false, public: true, special: 'mining' },
    { name: 'FARM', owner: 'SYSTEM', visits: 0, blocks: [], spawn: { x: 4, y: 6 }, locked: false, public: true, special: 'farming' }
  ]
};
fs.writeFileSync(path.join(RUNTIME, 'worlds.json'), JSON.stringify(demoWorlds, null, 2));

fs.writeFileSync(path.join(RUNTIME, 'players.json'), JSON.stringify({ players: {} }, null, 2));
fs.writeFileSync(path.join(RUNTIME, 'chatlog.json'), JSON.stringify({ messages: [] }, null, 2));
fs.writeFileSync(path.join(RUNTIME, 'audit.json'), JSON.stringify({ entries: [] }, null, 2));
fs.writeFileSync(path.join(RUNTIME, 'bans.json'), JSON.stringify({ banned: [], muted: [], jailed: [] }, null, 2));
fs.writeFileSync(path.join(RUNTIME, 'economy.json'), JSON.stringify({ lotteryPot: 0, lotteryTickets: [], dailyClaims: {} }, null, 2));

console.log('Veritabani tohumlandi:');
console.log('  - Admin: ' + adminUser.username + ' / ' + config.admin.defaultPassword);
console.log('  - Demo dunyalar olusturuldu (' + demoWorlds.worlds.length + ')');
console.log('  - Esyalar yuklendi (' + itemsSeed.items.length + ')');
