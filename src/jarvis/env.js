// Minik .env yukleyici (ek bagimlilik istemiyoruz).
// Var olan process.env degerlerinin uzerine yazmaz.
const fs = require('fs');

function parseEnv(text) {
  const out = {};
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '');
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else {
      // Tirnaksiz degerlerde satir sonu yorumu: KEY=deger # aciklama
      const hash = val.indexOf(' #');
      if (hash >= 0) val = val.slice(0, hash).trim();
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) out[key] = val;
  }
  return out;
}

function loadEnvFile(file) {
  if (!file || !fs.existsSync(file)) return {};
  const parsed = parseEnv(fs.readFileSync(file, 'utf8'));
  for (const [k, v] of Object.entries(parsed)) {
    if (!(k in process.env)) process.env[k] = v;
  }
  return parsed;
}

module.exports = { parseEnv, loadEnvFile };
