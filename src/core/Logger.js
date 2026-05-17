const fs = require('fs');
const path = require('path');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', gray: '\x1b[90m'
};

class Logger {
  constructor(name = 'core', logDir) {
    this.name = name;
    this.logDir = logDir || path.resolve(__dirname, '..', '..', 'logs');
    if (!fs.existsSync(this.logDir)) fs.mkdirSync(this.logDir, { recursive: true });
    this.file = path.join(this.logDir, this.fileName());
    this.lastDate = this.dateKey();
    this.listeners = new Set();
  }

  dateKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  fileName() { return `server-${this.dateKey()}.log`; }

  child(name) { return new Logger(`${this.name}:${name}`, this.logDir); }
  onLine(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  fmt(level, color, msg, extra) {
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const text = extra ? `${msg} ${JSON.stringify(extra)}` : msg;
    const plain = `[${ts}] [${level}] [${this.name}] ${text}`;
    const pretty = `${C.gray}${ts}${C.reset} ${color}${level.padEnd(5)}${C.reset} ${C.dim}${this.name}${C.reset} ${text}`;
    return { plain, pretty };
  }

  write(plain) {
    if (this.dateKey() !== this.lastDate) {
      this.lastDate = this.dateKey();
      this.file = path.join(this.logDir, this.fileName());
    }
    try { fs.appendFileSync(this.file, plain + '\n'); } catch {}
    for (const fn of this.listeners) try { fn(plain); } catch {}
  }

  log(level, color, msg, extra) {
    const { plain, pretty } = this.fmt(level, color, msg, extra);
    console.log(pretty);
    this.write(plain);
  }
  info(m, e) { this.log('INFO', C.cyan, m, e); }
  warn(m, e) { this.log('WARN', C.yellow, m, e); }
  error(m, e) { this.log('ERROR', C.red, m, e); }
  debug(m, e) { if (process.env.DEBUG) this.log('DEBUG', C.gray, m, e); }
  success(m, e) { this.log('OK', C.green, m, e); }
  event(m, e) { this.log('EVENT', C.magenta, m, e); }
}

Logger.colors = C;
module.exports = Logger;
