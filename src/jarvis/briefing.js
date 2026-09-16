// Gece raporu: son aramadan (veya son 24 saatten) bu yana sunucuda neler oldu?
// Hem sesli ajanin sistem promptuna hem de WhatsApp metin raporuna girdi olur.
const fs = require('fs');
const path = require('path');

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const MOD_ACTION_RE = /^(web\.)?(kick|ban|unban|mute|modmute|unmute|jail|unjail|warn|unwarn|freeze|promote|demote|setrole|resetplayer|reset)$/;

function safe(fn, fallback) { try { return fn(); } catch { return fallback; } }

function fmtTime(ts, timeZone) {
  if (!ts) return '?';
  return new Intl.DateTimeFormat('tr-TR', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
}
function fmtDateTime(ts, timeZone) {
  if (!ts) return '?';
  return new Intl.DateTimeFormat('tr-TR', { timeZone, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
}
function fmtDuration(ms) {
  const h = Math.floor(ms / HOUR);
  const m = Math.floor((ms % HOUR) / 60000);
  if (h >= 48) return `${Math.floor(h / 24)} gün`;
  if (h > 0) return `${h} saat ${m} dk`;
  return `${m} dk`;
}

// logs/server-YYYY-MM-DD.log dosyalarindan since sonrasi ERROR/WARN satirlarini sayar.
function scanLogs(logDir, since, now = Date.now()) {
  const out = { errors: 0, warns: 0, lastErrors: [] };
  if (!logDir || !fs.existsSync(logDir)) return out;
  const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10);
  const days = new Set();
  for (let t = since; t <= now + DAY; t += DAY) days.add(dayKey(t));
  days.add(dayKey(now));
  for (const d of [...days].sort()) {
    const file = path.join(logDir, `server-${d}.log`);
    if (!fs.existsSync(file)) continue;
    const st = safe(() => fs.statSync(file), null);
    if (!st || st.size > 20 * 1024 * 1024) continue;
    const text = safe(() => fs.readFileSync(file, 'utf8'), '');
    for (const line of text.split('\n')) {
      const m = /^\[(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\] \[(ERROR|WARN)\] (.*)$/.exec(line);
      if (!m) continue;
      const ts = Date.parse(`${m[1]}T${m[2]}Z`);
      if (!(ts >= since)) continue;
      if (m[3] === 'ERROR') {
        out.errors++;
        out.lastErrors.push(m[4].replace(/^\[[^\]]+\]\s*/, '').slice(0, 160));
        if (out.lastErrors.length > 3) out.lastErrors.shift();
      } else {
        out.warns++;
      }
    }
  }
  return out;
}

function buildBriefing(ctx, state, opts = {}) {
  const now = opts.now || Date.now();
  const timeZone = opts.timeZone || (ctx.config && ctx.config.server && ctx.config.server.timezone) || 'Europe/Istanbul';
  const maxWindow = opts.maxWindowMs || 7 * DAY;
  let since = opts.since || (state && state.data.lastBriefingAt) || 0;
  if (!since || now - since > maxWindow) since = now - DAY;
  if (since >= now) since = now - DAY;

  const players = safe(() => ctx.players.all(), []);
  const newPlayers = players.filter(p => p.createdAt >= since).sort((a, b) => b.createdAt - a.createdAt);
  const activePlayers = players.filter(p => p.lastSeen >= since);
  const online = safe(() => ctx.players.onlineCount(), 0);
  const peak = state ? state.peakOnline(since) : { peak: online, peakAt: now };

  const bansData = safe(() => ctx.bans.data, { banned: [], muted: [], jailed: [] });
  const newBans = (bansData.banned || []).filter(b => b.at >= since);
  const newMutes = (bansData.muted || []).filter(b => b.at >= since);
  const newJails = (bansData.jailed || []).filter(b => b.at >= since);

  const audit = safe(() => ctx.audit.data.entries.filter(e => e.ts >= since), []);
  const reports = audit.filter(e => e.action === 'report');
  const modActions = audit.filter(e => MOD_ACTION_RE.test(e.action));
  const webLogins = audit.filter(e => e.action === 'web.login');

  const chatMessages = safe(() => ctx.chat.data.messages.filter(m => m.ts >= since && m.type === 'chat').length, 0);
  const activeEvents = safe(() => ctx.events.listActive().map(e => e.name), []);
  const lotteryPot = safe(() => ctx.economy.data.lotteryPot, 0);
  const topRich = safe(() => ctx.economy.topRich(ctx.players, 3).map(p => ({ name: p.name, gems: p.gems })), []);
  const worldCount = safe(() => ctx.worlds.count(), 0);
  const startedAt = ctx.startedAt || now;
  const logDir = opts.logDir || (ctx.logger && ctx.logger.logDir) || path.resolve(__dirname, '..', '..', 'logs');
  const logs = scanLogs(logDir, since, now);

  return {
    since, until: now, timeZone,
    serverName: (ctx.config && ctx.config.server && ctx.config.server.name) || 'Sunucu',
    totalPlayers: players.length,
    newPlayers: newPlayers.map(p => ({ name: p.name, at: p.createdAt })),
    activeCount: activePlayers.length,
    online,
    peak: peak.peak, peakAt: peak.peakAt,
    chatMessages,
    reports: reports.map(r => ({ by: r.by, target: r.target, reason: r.detail && r.detail.reason, at: r.ts })),
    modActions: modActions.map(a => ({ action: a.action.replace(/^web\./, ''), by: a.by, target: a.target, at: a.ts })),
    newBans: newBans.map(b => ({ name: b.name, by: b.by, reason: b.reason, at: b.at, until: b.until })),
    newMutes: newMutes.map(b => ({ name: b.name, by: b.by, at: b.at })),
    newJails: newJails.map(b => ({ name: b.name, by: b.by, at: b.at })),
    webLogins: webLogins.length,
    activeEvents, lotteryPot, topRich, worldCount,
    uptimeMs: now - startedAt,
    restarted: startedAt >= since,
    startedAt,
    maintenance: !!ctx.maintenance,
    logs
  };
}

// Insan (ve Claude) icin Turkce ozet metni.
function briefingToText(b, opts = {}) {
  const tz = b.timeZone;
  const agent = opts.agentName || 'Jarvis';
  const names = (arr, n = 5) => arr.slice(0, n).map(x => x.name).join(', ') + (arr.length > n ? ` ve ${arr.length - n} kişi daha` : '');
  const lines = [];
  lines.push(`${agent} gece raporu — ${b.serverName}`);
  lines.push(`Kapsam: ${fmtDateTime(b.since, tz)} → ${fmtDateTime(b.until, tz)}`);
  lines.push('');
  const peakText = b.peak > 0 ? `en yoğun an ${b.peak} kişi (${fmtTime(b.peakAt, tz)})` : 'gece kimse çevrimiçi olmadı';
  lines.push(`Oyuncular: ${b.activeCount} oyuncu giriş yaptı, şu an ${b.online} kişi çevrimiçi, ${peakText}. Toplam kayıtlı: ${b.totalPlayers}.`);
  lines.push(b.newPlayers.length
    ? `Yeni kayıt: ${b.newPlayers.length} (${names(b.newPlayers)}).`
    : 'Yeni kayıt yok.');
  lines.push(`Sohbet: ${b.chatMessages} mesaj yazıldı.`);
  lines.push(b.reports.length
    ? `Şikayetler: ${b.reports.length} → ` + b.reports.slice(0, 5).map(r => `${r.by}, ${r.target}'ı bildirdi (${r.reason || 'sebep yok'})`).join('; ')
    : 'Şikayet yok, kimse kimseyi bildirmedi.');
  const modBits = [];
  if (b.newBans.length) modBits.push(`${b.newBans.length} ban (${names(b.newBans)})`);
  if (b.newMutes.length) modBits.push(`${b.newMutes.length} susturma`);
  if (b.newJails.length) modBits.push(`${b.newJails.length} hapis`);
  lines.push(modBits.length ? `Moderasyon: ${modBits.join(', ')}; toplam ${b.modActions.length} mod işlemi.` : 'Moderasyon işlemi yok.');
  lines.push(b.activeEvents.length ? `Aktif etkinlik: ${b.activeEvents.join(', ')}.` : 'Şu an aktif etkinlik yok.');
  lines.push(`Ekonomi: piyango havuzu ${b.lotteryPot} gem.` + (b.topRich.length ? ` En zengin: ${b.topRich.map(p => `${p.name} (${p.gems})`).join(', ')}.` : ''));
  if (b.restarted) lines.push(`Sunucu ${fmtTime(b.startedAt, tz)}'de yeniden başladı; ${fmtDuration(b.uptimeMs)}dır ayakta.`);
  else lines.push(`Sunucu kesintisiz ${fmtDuration(b.uptimeMs)}dır ayakta.`);
  if (b.maintenance) lines.push('Dikkat: sunucu bakım modunda.');
  if (b.logs.errors) lines.push(`Hatalar: ${b.logs.errors} hata, ${b.logs.warns} uyarı. Son hata: ${b.logs.lastErrors[b.logs.lastErrors.length - 1]}`);
  else lines.push(`Hata yok${b.logs.warns ? `, ${b.logs.warns} uyarı var` : ''}.`);
  lines.push(`Web panele ${b.webLogins} giriş yapıldı, dünya sayısı ${b.worldCount}.`);
  return lines.join('\n');
}

module.exports = { buildBriefing, briefingToText, scanLogs, fmtTime, fmtDateTime, fmtDuration };
