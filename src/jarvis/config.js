// Jarvis ayarlari: .env / ortam degiskenlerinden okunur.
// Tum degiskenler .env.example dosyasinda aciklanmistir.
const path = require('path');
const { loadEnvFile } = require('./env');

const TRUE_RE = /^(1|true|yes|on|evet)$/i;
const FALSE_RE = /^(0|false|no|off|hayir)$/i;

function flag(value, fallback) {
  if (value === undefined || value === '') return fallback;
  if (TRUE_RE.test(value)) return true;
  if (FALSE_RE.test(value)) return false;
  return fallback;
}

function parseTime(str, fallback) {
  const m = /^(\d{1,2})(?::(\d{2}))?$/.exec(String(str || '').trim());
  if (!m) return fallback;
  const hour = Number(m[1]);
  const minute = Number(m[2] || 0);
  if (hour > 23 || minute > 59) return fallback;
  return { hour, minute };
}

// "+905551112233" / "whatsapp:+90555..." -> kanala gore dogru adres
function toAddress(raw, channel) {
  let n = String(raw || '').trim().replace(/^whatsapp:/i, '').replace(/[\s()-]/g, '');
  if (n && !n.startsWith('+')) n = '+' + n;
  if (!n) return '';
  return channel === 'whatsapp' ? `whatsapp:${n}` : n;
}

function toWsUrl(httpUrl) {
  return String(httpUrl || '').replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
}

function loadJarvisConfig(root, serverConfig = {}) {
  loadEnvFile(path.join(root, '.env'));
  const env = process.env;
  const channel = (env.JARVIS_CHANNEL || 'whatsapp').toLowerCase() === 'phone' ? 'phone' : 'whatsapp';
  const time = parseTime(env.JARVIS_CALL_TIME, { hour: 6, minute: 0 });
  const serverTz = serverConfig.server && serverConfig.server.timezone;

  const cfg = {
    enabled: flag(env.JARVIS_ENABLED, false),
    dryRun: flag(env.JARVIS_DRY_RUN, false),
    channel,
    publicUrl: String(env.JARVIS_PUBLIC_URL || '').trim().replace(/\/+$/, ''),
    from: toAddress(env.JARVIS_FROM, channel),
    to: toAddress(env.JARVIS_TO, channel),
    agentName: env.JARVIS_NAME || 'Jarvis',
    ownerName: env.JARVIS_OWNER_NAME || 'efendim',
    greeting: env.JARVIS_GREETING || '',
    twilio: {
      accountSid: env.TWILIO_ACCOUNT_SID || '',
      authToken: env.TWILIO_AUTH_TOKEN || '',
      apiKey: env.TWILIO_API_KEY || '',
      apiSecret: env.TWILIO_API_SECRET || ''
    },
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    model: env.JARVIS_MODEL || 'claude-opus-5',
    effort: env.JARVIS_EFFORT || 'low',
    fallbacks: flag(env.JARVIS_FALLBACKS, true),
    schedule: {
      enabled: flag(env.JARVIS_SCHEDULE, true),
      hour: time.hour,
      minute: time.minute,
      timeZone: env.JARVIS_TIMEZONE || serverTz || 'Europe/Istanbul'
    },
    voice: {
      language: env.JARVIS_LANGUAGE || 'tr-TR',
      ttsProvider: env.JARVIS_TTS_PROVIDER || 'Google',
      voice: env.JARVIS_VOICE || 'tr-TR-Wavenet-B',
      sttProvider: env.JARVIS_STT_PROVIDER || 'Deepgram',
      speechModel: env.JARVIS_SPEECH_MODEL || 'nova-2-general'
    },
    validateSignatures: flag(env.JARVIS_VALIDATE_SIGNATURES, true),
    permissionContentSid: env.JARVIS_PERMISSION_CONTENT_SID || '',
    // WhatsApp isletme aramasi kisitlari (Meta): izin sonrasi 24 saatte 5 arama, izin 7 gun gecerli,
    // izin istegi 24 saatte 1, 7 gunde 2.
    limits: {
      callsPerDay: channel === 'whatsapp' ? 5 : 20,
      permissionDays: 7,
      permissionRequestsPerDay: 1,
      permissionRequestsPerWeek: 2
    },
    briefingMaxWindowMs: 7 * 24 * 3600 * 1000
  };
  cfg.publicWsUrl = toWsUrl(cfg.publicUrl);

  const problems = [];
  if (cfg.enabled) {
    if (!cfg.publicUrl || !/^https?:\/\//i.test(cfg.publicUrl)) problems.push('JARVIS_PUBLIC_URL eksik (ornek: https://xxxx.ngrok-free.app)');
    if (!cfg.twilio.accountSid) problems.push('TWILIO_ACCOUNT_SID eksik');
    if (!cfg.twilio.authToken) problems.push('TWILIO_AUTH_TOKEN eksik (webhook imza dogrulamasi icin sart)');
    if (!cfg.from) problems.push('JARVIS_FROM eksik (Twilio WhatsApp sender veya telefon numarasi)');
    if (!cfg.to) problems.push('JARVIS_TO eksik (aranacak numara)');
    if (!cfg.anthropicApiKey && !cfg.dryRun) problems.push('ANTHROPIC_API_KEY eksik (JARVIS_DRY_RUN=1 ile anahtarsiz test edilebilir)');
    if (channel === 'whatsapp' && /^whatsapp:\+90/.test(cfg.from)) {
      problems.push('JARVIS_FROM +90 ile basliyor: Meta, Turkiye numarali WhatsApp senderlardan isletme baslatmali aramaya izin vermiyor. Baska ulke numarasi kullanin.');
    }
  }
  return { cfg, problems };
}

module.exports = { loadJarvisConfig, toAddress, toWsUrl, parseTime, flag };
