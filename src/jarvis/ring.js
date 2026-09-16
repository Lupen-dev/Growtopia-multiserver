// CallMeBot: Telegram'i gercekten caldirip metni sesli okuyan bedava API (tek yonlu).
// Kullanici bir kez @CallMeBot_txtbot'a /start yazip izin verir. Metin en fazla 256 karakter.
// Dokuman: https://www.callmebot.com/telegram-call-api/
const RING_URL = 'https://api.callmebot.com/start.php';
const MAX_TEXT = 256;

function buildRingUrl({ user, text, lang = 'tr-TR-Standard-A', rpt = 1 }) {
  const params = new URLSearchParams({ user, text: String(text).slice(0, MAX_TEXT), lang, rpt: String(rpt) });
  return `${RING_URL}?${params.toString()}`;
}

async function ringTelegram({ user, text, lang, rpt, fetchImpl, logger }) {
  const url = buildRingUrl({ user, text, lang, rpt });
  const res = await (fetchImpl || globalThis.fetch)(url, { method: 'GET' });
  const body = (await res.text().catch(() => '')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  const ok = res.ok && !/error|not authorized|unauthorized/i.test(body);
  if (logger) (ok ? logger.info : logger.warn).call(logger, `CallMeBot aramasi: HTTP ${res.status} ${body}`);
  return { ok, status: res.status, body };
}

// 256 karaktere sigan Turkce ozet (arama sirasinda okunur)
function ringSummary(b, agentName = 'Jarvis') {
  const bits = [];
  bits.push(`${b.activeCount} oyuncu girdi`);
  bits.push(`${b.newPlayers.length} yeni kayıt`);
  if (b.reports.length) bits.push(`${b.reports.length} şikayet`);
  if (b.newBans.length) bits.push(`${b.newBans.length} ban`);
  bits.push(b.logs.errors ? `${b.logs.errors} hata` : 'hata yok');
  let text = `Günaydın efendim, ben ${agentName}. Gece raporu: ${bits.join(', ')}. Ayrıntılar Telegram'da.`;
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT - 1) + '.';
  return text;
}

module.exports = { buildRingUrl, ringTelegram, ringSummary, MAX_TEXT };
