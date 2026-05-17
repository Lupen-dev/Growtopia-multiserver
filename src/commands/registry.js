// Tum komut dosyalarini topla
const player = require('./player');
const fun = require('./fun');
const mod = require('./mod');
const admin = require('./admin');

module.exports = function registerAll(handler) {
  handler.registerMany(player);
  handler.registerMany(fun);
  handler.registerMany(mod);
  handler.registerMany(admin);
  return handler;
};
