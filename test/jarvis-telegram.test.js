// Telegram kanali testleri (ag yok: fetch taklit edilir)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { TelegramGateway, splitText } = require('../src/jarvis/telegram');
const { buildRingUrl, ringSummary, MAX_TEXT } = require('../src/jarvis/ring');
const { transcribe, synthesize } = require('../src/jarvis/speech');
const { loadJarvisConfig, pickChannel } = require('../src/jarvis/config');
const { Jarvis } = require('../src/jarvis');

const silentLog = { info() {}, warn() {}, error() {}, success() {}, debug() {}, event() {}, child() { return silentLog; }, logDir: os.tmpdir() };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Sahte Telegram Bot API + Groq + CallMeBot
function fakeFetch(calls) {
  return async (url, opts = {}) => {
    const u = String(url);
    const m = /\/bot[^/]+\/(\w+)$/.exec(u);
    if (m) {
      const method = m[1];
      let params = {};
      if (opts.body instanceof FormData) {
        for (const [k, v] of opts.body.entries()) params[k] = v instanceof Blob ? { blob: true, size: v.size, type: v.type } : v;
      } else if (opts.body) params = JSON.parse(opts.body);
      calls.push({ method, params });
      let result = true;
      if (method === 'getUpdates') {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, 30);
          if (opts.signal) opts.signal.addEventListener('abort', () => { clearTimeout(t); reject(new Error('aborted')); });
        });
        result = [];
      }
      if (method === 'getMe') result = { username: 'jarvis_test_bot' };
      if (method === 'getFile') result = { file_path: 'voice/file_1.oga' };
      if (method === 'sendMessage' || method === 'sendVoice') result = { message_id: calls.length };
      return { ok: true, status: 200, json: async () => ({ ok: true, result }) };
    }
    if (u.includes('/file/bot')) {
      calls.push({ method: 'download', url: u });
      return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
    }
    if (u.includes('groq.com')) {
      calls.push({ method: 'groq', auth: opts.headers && opts.headers.authorization });
      return { ok: true, status: 200, json: async () => ({ text: 'kimse kızgın mı' }) };
    }
    throw new Error('beklenmeyen url: ' + u);
  };
}

function withEnv(vars, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(vars)) { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  const restore = () => { for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } };
  return fn().finally(restore);
}

const TG_ENV = {
  JARVIS_ENABLED: '1', JARVIS_DRY_RUN: '1', JARVIS_SCHEDULE: '0', JARVIS_CHANNEL: undefined,
  TELEGRAM_BOT_TOKEN: '123:abc', TELEGRAM_CHAT_ID: '42', CALLMEBOT_USER: '@cafer', GROQ_API_KEY: 'gsk_test',
  JARVIS_TTS: '1', ANTHROPIC_API_KEY: undefined, JARVIS_PUBLIC_URL: undefined
};

function makeCtx() {
  const db = { load: (name, fallback) => fallback, mark() {} };
  return {
    startedAt: Date.now() - 3600e3,
    config: { server: { name: 'Test', timezone: 'Europe/Istanbul' } },
    logger: silentLog, db,
    players: { all: () => [{ name: 'A', createdAt: Date.now() - 1000, lastSeen: Date.now() }], onlineCount: () => 1 },
    bans: { data: { banned: [], muted: [], jailed: [] } },
    audit: { data: { entries: [] } },
    chat: { data: { messages: [] } },
    events: { listActive: () => [] },
    economy: { data: { lotteryPot: 5 }, topRich: () => [] },
    worlds: { count: () => 1 }
  };
}

function makeJarvis(envOverrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-tg-'));
  const calls = [];
  const rings = [];
  const j = new Jarvis(makeCtx(), {
    root,
    fetch: fakeFetch(calls),
    deps: {
      synthesize: async (text) => ({ buffer: Buffer.from('MP3' + text.length), ext: 'mp3', mime: 'audio/mpeg' }),
      ringTelegram: async (args) => { rings.push(args); return { ok: true, status: 200, body: 'Message queued' }; }
    }
  });
  return { j, calls, rings, cleanup: () => { j.stop(); fs.rmSync(root, { recursive: true, force: true }); } };
}

test('config: TELEGRAM_BOT_TOKEN varsa kanal otomatik telegram olur ve uyarilar uretilir', async () => {
  await withEnv({ ...TG_ENV, TELEGRAM_CHAT_ID: undefined, CALLMEBOT_USER: undefined, GROQ_API_KEY: undefined }, async () => {
    assert.equal(pickChannel(process.env), 'telegram');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-cfg-'));
    const { cfg, problems, warnings } = loadJarvisConfig(root, {});
    assert.equal(cfg.channel, 'telegram');
    assert.equal(cfg.twilioChannel, false);
    assert.deepEqual(problems, []);
    assert.equal(warnings.length, 3);
    fs.rmSync(root, { recursive: true, force: true });
  });
  await withEnv({ ...TG_ENV, TELEGRAM_BOT_TOKEN: undefined }, async () => {
    assert.equal(pickChannel(process.env), 'whatsapp');
  });
});

test('ring: URL 256 karaktere kirpilir, ozet sinira sigar', () => {
  const url = buildRingUrl({ user: '@cafer', text: 'a'.repeat(300), lang: 'tr-TR-Standard-A', rpt: 1 });
  const q = new URL(url).searchParams;
  assert.equal(q.get('user'), '@cafer');
  assert.equal(q.get('text').length, MAX_TEXT);
  assert.equal(q.get('lang'), 'tr-TR-Standard-A');
  const summary = ringSummary({ activeCount: 12, newPlayers: [1, 2], reports: [1], newBans: [], logs: { errors: 0 } }, 'Jarvis');
  assert.ok(summary.length <= MAX_TEXT);
  assert.match(summary, /12 oyuncu girdi, 2 yeni kayıt, 1 şikayet, hata yok/);
});

test('telegram: splitText uzun metni boler, gateway sendVoice multipart yollar', async () => {
  const parts = splitText('satir\n'.repeat(1000), 4000);
  assert.ok(parts.length >= 2);
  assert.ok(parts.every(p => p.length <= 4000));
  const calls = [];
  const tg = new TelegramGateway({ token: '123:abc', chatId: '42', logger: silentLog, fetchImpl: fakeFetch(calls) });
  await tg.sendVoice(Buffer.from('abc'), { filename: 'j.mp3', mime: 'audio/mpeg' });
  assert.equal(calls[0].method, 'sendVoice');
  assert.equal(calls[0].params.chat_id, '42');
  assert.deepEqual(calls[0].params.voice, { blob: true, size: 3, type: 'audio/mpeg' });
  await assert.rejects(() => new TelegramGateway({ token: 'x', chatId: '', fetchImpl: fakeFetch([]) }).sendMessage('hi'), /TELEGRAM_CHAT_ID/);
});

test('speech: transcribe Groq cevabini dondurur, synthesize hata durumunda null verir', async () => {
  const calls = [];
  const text = await transcribe(Buffer.from('ogg'), { apiKey: 'gsk_test', fetchImpl: fakeFetch(calls) });
  assert.equal(text, 'kimse kızgın mı');
  assert.equal(calls[0].auth, 'Bearer gsk_test');
  await assert.rejects(() => transcribe(Buffer.from('x'), { apiKey: '' }), /GROQ_API_KEY/);
  const r = await synthesize('merhaba', { logger: silentLog, ttsImpl: async () => { throw new Error('servis yok'); } });
  assert.equal(r, null);
  const ok = await synthesize('merhaba', { ttsImpl: async (t, v) => ({ buffer: Buffer.from(t + v), ext: 'mp3', mime: 'audio/mpeg' }), voice: 'tr-TR-AhmetNeural' });
  assert.equal(ok.buffer.toString(), 'merhabatr-TR-AhmetNeural');
});

test('Jarvis telegram: sabah rutini caldirir, raporu metin + sesli yollar', async () => {
  await withEnv(TG_ENV, async () => {
    const { j, calls, rings, cleanup } = makeJarvis();
    try {
      assert.equal(j.start(), true);
      assert.equal(j.cfg.channel, 'telegram');
      const r = await j.morningCall();
      assert.deepEqual(r, { ok: true, rang: true, kind: 'briefing' });
      assert.equal(rings.length, 1);
      assert.equal(rings[0].user, '@cafer');
      assert.ok(rings[0].text.length <= 256);
      const msg = calls.find(c => c.method === 'sendMessage');
      assert.match(msg.params.text, /Jarvis gece raporu/);
      assert.ok(calls.some(c => c.method === 'sendVoice'));
      assert.ok(j.state.data.lastBriefingAt > 0);
      assert.equal(j.state.data.calls.length, 1);
      assert.match(j.statusText(), /Kanal: telegram/);
      assert.equal(j.status().canCall.ok, true);
    } finally { cleanup(); }
  });
});

test('Jarvis telegram: sahip komutlari, sesli soru ve yabanci sohbet', async () => {
  await withEnv(TG_ENV, async () => {
    const { j, calls, cleanup } = makeJarvis();
    try {
      j.start();
      const owner = (extra) => ({ chat: { id: 42, type: 'private' }, from: { id: 42, username: 'cafer' }, ...extra });
      // Yabanci sohbet: cevap verilmez (chat id ayarli)
      await j.onTelegramMessage({ chat: { id: 99 }, from: { username: 'x' }, text: 'rapor' });
      assert.equal(calls.filter(c => c.method === 'sendMessage').length, 0);
      // rapor
      await j.onTelegramMessage(owner({ text: '/rapor' }));
      assert.match(calls.find(c => c.method === 'sendMessage').params.text, /gece raporu/);
      assert.ok(calls.some(c => c.method === 'sendVoice'));
      // durum
      calls.length = 0;
      await j.onTelegramMessage(owner({ text: 'durum' }));
      assert.match(calls[0].params.text, /Telefon çaldırma \(CallMeBot\): açık, @cafer/);
      // sesli soru -> Groq -> Duydugum -> EchoBrain cevabi (metin + ses)
      calls.length = 0;
      await j.onTelegramMessage(owner({ voice: { file_id: 'F1', duration: 2, mime_type: 'audio/ogg' } }));
      const methods = calls.map(c => c.method);
      assert.deepEqual(methods.slice(0, 4), ['sendChatAction', 'getFile', 'download', 'groq']);
      const texts = calls.filter(c => c.method === 'sendMessage').map(c => c.params.text);
      assert.equal(texts[0], 'Duyduğum: "kimse kızgın mı"');
      assert.match(texts[1], /Deneme modundayım/);
      assert.ok(calls.some(c => c.method === 'sendVoice'));
      // yardim
      calls.length = 0;
      await j.onTelegramMessage(owner({ text: '/start' }));
      assert.match(calls[0].params.text, /Komutlar/);
    } finally { cleanup(); }
  });
});

test('Jarvis telegram: chat id yoksa ipucu verir; kullanici adiyla sahip dogrulanir', async () => {
  await withEnv({ ...TG_ENV, TELEGRAM_CHAT_ID: undefined }, async () => {
    const { j, calls, cleanup } = makeJarvis();
    try {
      j.start();
      await j.onTelegramMessage({ chat: { id: 555 }, from: { username: 'biri' }, text: 'merhaba' });
      const hint = calls.find(c => c.method === 'sendMessage');
      assert.equal(hint.params.chat_id, '555');
      assert.match(hint.params.text, /TELEGRAM_CHAT_ID=555/);
      const r = await j.telegramCall('manual');
      assert.equal(r.ok, true);              // CallMeBot calar ama mesaj gidemez
      assert.match(r.reason, /chat ID/);
    } finally { cleanup(); }
  });
  await withEnv({ ...TG_ENV, TELEGRAM_CHAT_ID: '@Cafer' }, async () => {
    const { j, calls, cleanup } = makeJarvis();
    try {
      j.start();
      await j.onTelegramMessage({ chat: { id: 7 }, from: { username: 'cafer' }, text: 'durum' });
      assert.equal(j.telegram.chatId, '7');
      assert.equal(j.state.data.telegramChatId, '7');
      assert.equal(calls.find(c => c.method === 'sendMessage').params.chat_id, '7');
    } finally { cleanup(); }
  });
});

test('Jarvis telegram: sesli soru GROQ_API_KEY olmadan aciklama doner', async () => {
  await withEnv({ ...TG_ENV, GROQ_API_KEY: undefined }, async () => {
    const { j, calls, cleanup } = makeJarvis();
    try {
      j.start();
      await j.onTelegramMessage({ chat: { id: 42 }, from: { username: 'cafer' }, voice: { file_id: 'F1' } });
      assert.match(calls.find(c => c.method === 'sendMessage').params.text, /GROQ_API_KEY/);
      await sleep(50);
    } finally { cleanup(); }
  });
});
