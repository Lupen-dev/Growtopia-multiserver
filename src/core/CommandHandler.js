const Perms = require('./Permissions');

class CommandHandler {
  constructor(ctx) {
    this.ctx = ctx;
    this.log = ctx.logger.child('cmd');
    this.commands = new Map();
    this.aliases = new Map();
  }

  register(def) {
    const cmd = {
      name: def.name.toLowerCase(),
      aliases: (def.aliases || []).map(a => a.toLowerCase()),
      role: def.role || 'player',
      category: def.category || 'general',
      desc: def.desc || '',
      usage: def.usage || `/${def.name}`,
      hidden: !!def.hidden,
      handler: def.handler
    };
    this.commands.set(cmd.name, cmd);
    for (const a of cmd.aliases) this.aliases.set(a, cmd.name);
    return cmd;
  }

  registerMany(arr) { arr.forEach(d => this.register(d)); }
  resolve(name) {
    const n = name.toLowerCase().replace(/^\//, '');
    return this.commands.get(n) || this.commands.get(this.aliases.get(n));
  }
  list() { return [...this.commands.values()]; }
  byCategory() {
    const out = {};
    for (const c of this.list()) {
      (out[c.category] = out[c.category] || []).push(c);
    }
    return out;
  }

  async execute(player, line) {
    if (!line.startsWith('/')) return { ok: false, error: 'Komutlar / ile baslar.' };
    const parts = line.slice(1).trim().split(/\s+/);
    const name = parts.shift() || '';
    const cmd = this.resolve(name);
    if (!cmd) return { ok: false, error: `Komut bulunamadi: /${name}. /help dene.` };
    if (!Perms.atLeast(player.role, cmd.role)) return { ok: false, error: 'Bu komutu kullanma yetkin yok.' };
    try {
      const result = await cmd.handler({ player, args: parts, ctx: this.ctx, raw: line });
      this.log.debug(`${player.name} ran /${cmd.name}`);
      return result || { ok: true };
    } catch (e) {
      this.log.error(`/${cmd.name} hata`, { err: e.message });
      return { ok: false, error: 'Komut calistirilirken hata olustu: ' + e.message };
    }
  }
}

module.exports = CommandHandler;
