// Jarvis birim testleri (ag baglantisi gerekmez): node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ReplyStreamer, parseControl, sanitizeForSpeech } = require('../src/jarvis/textStream');
const { msUntilNext, wallClockToUtc } = require('../src/jarvis/scheduler');
const { JarvisState, DAY } = require('../src/jarvis/state');
const { CallPermissions } = require('../src/jarvis/permissions');
const { buildBriefing, briefingToText } = require('../src/jarvis/briefing');
const { CallSession } = require('../src/jarvis/relay');
const { loadJarvisConfig, toAddress } = require('../src/jarvis/config');
const { parseEnv } = require('../src/jarvis/env');

const fakeDb = () => ({ load: (name, fallback) => fallback, mark() {} });
const silentLog = { info() {}, warn() {}, error() {}, success() {}, debug() {}, event() {}, child() { return silentLog; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, timeout = 2000) {
  const t0 = Date.now();
  while (!fn()) { if (Date.now() - t0 > timeout) throw new Error('waitFor zaman asimi'); await sleep(10); }
}

// ---------- textStream ----------
test('ReplyStreamer: bastaki [[KAPAT]] isareti ayiklanir ve seslendirilmez', () => {
  const said = [];
  const s = new ReplyStreamer({ onSentence: x => said.push(x) });
  for (const chunk of ['[[', 'KAPAT]] Görü', 'şürüz efendim.']) s.push(chunk);
  const r = s.end();
  assert.equal(r.control.end, true);
  assert.equal(r.control.snoozeMin, undefined);
  assert.equal(r.spoken, 'Görüşürüz efendim.');
  assert.deepEqual(said, ['Görüşürüz efendim.']);
});

test('ReplyStreamer: [[ERTELE:10]] erteleme dakikasini verir', () => {
  const s = new ReplyStreamer();
  s.push('[[ERTELE:10]] Tamam efendim, 10 dakika sonra ararım.');
  const r = s.end();
  assert.equal(r.control.end, true);
  assert.equal(r.control.snoozeMin, 10);
  assert.equal(r.spoken, 'Tamam efendim, 10 dakika sonra ararım.');
});

test('ReplyStreamer: cumleler tamamlandikca akitilir, kalan end() ile gider', () => {
  const said = [];
  const s = new ReplyStreamer({ onSentence: x => said.push(x) });
  s.push('Gece 38 mesaj geldi. Kimse kızgın değil. Sunucu');
  assert.deepEqual(said, ['Gece 38 mesaj geldi. Kimse kızgın değil.']);
  s.push(' sorunsuz.');
  const r = s.end();
  assert.deepEqual(said, ['Gece 38 mesaj geldi. Kimse kızgın değil.', 'Sunucu sorunsuz.']);
  assert.equal(r.control.end, undefined);
});

test('ReplyStreamer: yarim kalan isaret seslendirilmez', () => {
  const said = [];
  const s = new ReplyStreamer({ onSentence: x => said.push(x), minFlush: 1 });
  s.push('Tamam efendim. [[KAP');
  assert.deepEqual(said, ['Tamam efendim.']);
  s.push('AT]]');
  const r = s.end();
  assert.equal(r.control.end, true);
  assert.equal(r.spoken, 'Tamam efendim.');
});

test('sanitizeForSpeech markdown temizler, parseControl bilinmeyen isareti siler', () => {
  assert.equal(sanitizeForSpeech('**Önemli:** 3 ban\n- kick: 2'), 'Önemli: 3 ban kick: 2');
  const p = parseControl('[[BILINMEYEN]] merhaba');
  assert.deepEqual(p.control, {});
  assert.equal(p.text.trim(), 'merhaba');
});

// ---------- scheduler ----------
test('msUntilNext: Istanbul saatiyle 06:00 dogru hesaplanir', () => {
  const now = Date.UTC(2026, 8, 16, 0, 0, 0);            // 03:00 Istanbul
  assert.equal(msUntilNext(6, 0, 'Europe/Istanbul', now), 3 * 3600 * 1000);
  const later = Date.UTC(2026, 8, 16, 5, 0, 0);          // 08:00 Istanbul -> yarin
  assert.equal(msUntilNext(6, 0, 'Europe/Istanbul', later), 22 * 3600 * 1000);
});

test('wallClockToUtc: yaz saati gecisinde dogru UTC verir (Europe/Berlin)', () => {
  // 25 Ekim 2026'da Berlin 03:00 CEST -> 02:00 CET. 06:00 CET = 05:00Z
  assert.equal(wallClockToUtc(2026, 10, 25, 6, 0, 'Europe/Berlin'), Date.UTC(2026, 9, 25, 5, 0, 0));
  // 24 Ekim 06:00 CEST = 04:00Z
  assert.equal(wallClockToUtc(2026, 10, 24, 6, 0, 'Europe/Berlin'), Date.UTC(2026, 9, 24, 4, 0, 0));
  const now = Date.UTC(2026, 9, 24, 20, 0, 0);
  assert.equal(msUntilNext(6, 0, 'Europe/Berlin', now), 9 * 3600 * 1000);
});

// ---------- permissions ----------
function makePermissions(channel = 'whatsapp') {
  const state = new JarvisState(fakeDb());
  const cfg = { channel, limits: { callsPerDay: channel === 'whatsapp' ? 5 : 20, permissionDays: 7, permissionRequestsPerDay: 1, permissionRequestsPerWeek: 2 } };
  const sent = [];
  const gateway = {
    ensureContentTemplate: async () => 'HX123',
    sendPermissionRequest: async (sid) => { sent.push(sid); return { sid: 'SM1' }; }
  };
  return { state, perms: new CallPermissions({ cfg, state, gateway, logger: silentLog }), sent };
}

test('CallPermissions: WhatsApp izin akisi ve gunluk limit', async () => {
  const { state, perms, sent } = makePermissions();
  const now = Date.now();
  assert.equal(perms.canCallNow(now).ok, false);
  const req = await perms.request();
  assert.equal(req.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(state.data.permission.status, 'pending');
  assert.equal(perms.canRequestNow().ok, false);           // 24 saatte 1
  assert.equal(perms.canCallNow(now).ok, false);
  const wh = perms.handleWebhook({ Body: 'VOICE_CALL_REQUEST', ButtonPayload: 'ACCEPTED' });
  assert.deepEqual(wh, { handled: true, accepted: true });
  assert.ok(state.data.permission.expiresAt > now + 6 * DAY);
  assert.equal(perms.canCallNow(now).ok, true);
  for (let i = 0; i < 5; i++) state.recordCall({ sid: 'CA' + i, kind: 'manual' });
  assert.match(perms.canCallNow().reason, /limit/);
  assert.equal(perms.handleWebhook({ Body: 'merhaba' }).handled, false);
});

test('CallPermissions: suresi dolan izin ve 4 cevapsiz arama', () => {
  const { state, perms } = makePermissions();
  const now = Date.now();
  state.setPermission({ status: 'accepted', expiresAt: now - 1000 });
  assert.match(perms.canCallNow(now).reason, /süresi doldu/);
  assert.equal(perms.shouldRenew(now), true);
  state.setPermission({ status: 'accepted', expiresAt: now + 3 * DAY });
  assert.equal(perms.shouldRenew(now), false);
  for (let i = 0; i < 4; i++) perms.recordCallOutcome('no-answer');
  assert.equal(state.data.permission.status, 'none');
});

test('CallPermissions: telefon kanalinda izin gerekmez', () => {
  const { perms } = makePermissions('phone');
  assert.equal(perms.required, false);
  assert.equal(perms.canCallNow().ok, true);
  assert.equal(perms.canRequestNow().ok, false);
});

// ---------- briefing ----------
test('buildBriefing: sayimlar ve metin', () => {
  const now = Date.now();
  const H = 3600 * 1000;
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-logs-'));
  const ts = (t) => new Date(t).toISOString().replace('T', ' ').slice(0, 19);
  fs.writeFileSync(path.join(logDir, `server-${new Date(now).toISOString().slice(0, 10)}.log`),
    `[${ts(now - 2 * H)}] [ERROR] [server:game] baglanti koptu\n[${ts(now - 30 * H)}] [ERROR] [server] eski hata\n[${ts(now - H)}] [WARN] [server] uyari\n`);
  const ctx = {
    startedAt: now - 30 * H,
    config: { server: { name: 'Test Sunucu', timezone: 'Europe/Istanbul' } },
    players: {
      all: () => [
        { name: 'Yeni', createdAt: now - H, lastSeen: now - H },
        { name: 'Eski', createdAt: now - 3 * DAY, lastSeen: now - 30 * 60000 },
        { name: 'Uyuyan', createdAt: now - 3 * DAY, lastSeen: now - 2 * DAY }
      ],
      onlineCount: () => 1
    },
    bans: { data: { banned: [{ name: 'Kotu', by: 'admin', reason: 'hile', at: now - 2 * H }], muted: [], jailed: [] } },
    audit: { data: { entries: [
      { ts: now - H, action: 'report', by: 'Eski', target: 'Kotu', detail: { reason: 'küfür' } },
      { ts: now - H, action: 'web.ban', by: 'admin', target: 'Kotu' },
      { ts: now - H, action: 'web.login', by: 'admin' }
    ] } },
    chat: { data: { messages: [{ ts: now - H, type: 'chat' }, { ts: now - H, type: 'system' }, { ts: now - 2 * DAY, type: 'chat' }] } },
    events: { listActive: () => [{ name: 'Meteor Yagmuru' }] },
    economy: { data: { lotteryPot: 1200 }, topRich: () => [{ name: 'Eski', gems: 999 }] },
    worlds: { count: () => 4 },
    logger: { logDir }
  };
  const b = buildBriefing(ctx, null, { now, logDir });
  assert.equal(b.newPlayers.length, 1);
  assert.equal(b.activeCount, 2);
  assert.equal(b.newBans.length, 1);
  assert.equal(b.reports.length, 1);
  assert.equal(b.modActions.length, 1);
  assert.equal(b.chatMessages, 1);
  assert.equal(b.webLogins, 1);
  assert.equal(b.logs.errors, 1);
  assert.equal(b.logs.warns, 1);
  assert.equal(b.restarted, false);
  const text = briefingToText(b, { agentName: 'Jarvis' });
  assert.match(text, /Yeni kayıt: 1 \(Yeni\)/);
  assert.match(text, /Şikayetler: 1/);
  assert.match(text, /1 ban \(Kotu\)/);
  assert.match(text, /Meteor Yagmuru/);
  assert.match(text, /1 hata, 1 uyarı/);
  fs.rmSync(logDir, { recursive: true, force: true });
});

// ---------- relay ----------
class FakeWs extends EventEmitter {
  constructor() { super(); this.readyState = 1; this.sent = []; }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = 3; this.emit('close'); }
}
const fakeBrain = {
  async reply({ history, onToken, signal }) {
    const last = history[history.length - 1].content.toLowerCase();
    let text = 'Gece 38 mesaj geldi. Kimse kızgın değil efendim.';
    if (/görüşürüz/.test(last)) text = '[[KAPAT]] Görüşürüz efendim.';
    if (/yavaş/.test(last)) {
      // yavas akan cevap (interrupt testi icin)
      const words = 'Bu uzun bir cevap efendim ve kelime kelime geliyor. Devam ediyor.'.split(' ');
      let out = '';
      for (const w of words) {
        if (signal.aborted) return { text: out, aborted: true, stopReason: 'aborted' };
        await sleep(20);
        out += w + ' ';
        onToken(w + ' ');
      }
      return { text: out, aborted: false, stopReason: 'end_turn' };
    }
    for (const w of text.split(/(?<=\s)/)) onToken(w);
    return { text, aborted: false, stopReason: 'end_turn' };
  }
};

function makeSession(ws, extra = {}) {
  const ended = [];
  const session = new CallSession({
    ws, cfg: {}, logger: silentLog, brain: fakeBrain, endDelayMs: 0,
    getSystemPrompt: async ({ kind }) => 'SYSTEM ' + kind,
    onEnd: (info) => ended.push(info),
    ...extra
  }).attach();
  return { session, ended };
}
const emit = (ws, obj) => ws.emit('message', JSON.stringify(obj));

test('CallSession: setup + prompt -> text tokenlari ve last:true', async () => {
  const ws = new FakeWs();
  const { session } = makeSession(ws);
  emit(ws, { type: 'setup', callSid: 'CA1', customParameters: { kind: 'callback' } });
  await waitFor(() => session.system === 'SYSTEM callback');
  emit(ws, { type: 'prompt', voicePrompt: 'şimdi anlat', lang: 'tr-TR', last: true });
  await waitFor(() => ws.sent.some(m => m.type === 'text' && m.last === true));
  const texts = ws.sent.filter(m => m.type === 'text');
  assert.equal(texts[texts.length - 1].token, '');
  assert.equal(texts.slice(0, -1).map(m => m.token).join('').trim(), 'Gece 38 mesaj geldi. Kimse kızgın değil efendim.');
  assert.ok(!ws.sent.some(m => m.type === 'end'));
  assert.equal(session.history.length, 2);
  assert.equal(session.history[1].role, 'assistant');
});

test('CallSession: [[KAPAT]] -> end mesaji ve handoffData', async () => {
  const ws = new FakeWs();
  const { session, ended } = makeSession(ws);
  emit(ws, { type: 'setup', callSid: 'CA2', customParameters: { kind: 'briefing' } });
  await waitFor(() => !!session.system);
  emit(ws, { type: 'prompt', voicePrompt: 'tamam görüşürüz', last: true });
  await waitFor(() => ws.sent.some(m => m.type === 'end'));
  const end = ws.sent.find(m => m.type === 'end');
  assert.deepEqual(JSON.parse(end.handoffData), { reason: 'end', snoozeMin: 0, kind: 'briefing' });
  assert.ok(!ws.sent.some(m => m.type === 'text' && /KAPAT/.test(m.token)));
  ws.close();
  assert.equal(ended.length, 1);
  assert.equal(ended[0].reason, 'end');
  assert.equal(ended[0].callSid, 'CA2');
});

test('CallSession: interrupt akan cevabi keser ve gecmisi isaretler', async () => {
  const ws = new FakeWs();
  const { session } = makeSession(ws);
  emit(ws, { type: 'setup', callSid: 'CA3', customParameters: {} });
  await waitFor(() => !!session.system);
  emit(ws, { type: 'prompt', voicePrompt: 'yavaş anlat', last: true });
  await waitFor(() => ws.sent.some(m => m.type === 'text' && m.token.trim()));
  emit(ws, { type: 'interrupt', utteranceUntilInterrupt: 'Bu uzun bir', durationUntilInterruptMs: 500 });
  await waitFor(() => !session.busy);
  const last = session.history[session.history.length - 1];
  assert.equal(last.role, 'assistant');
  assert.match(last.content, /araya girdi/);
  assert.ok(!ws.sent.some(m => m.type === 'text' && m.last === true), 'kesilen turda last:true gonderilmez');
  // Yeni tur normal calisir
  emit(ws, { type: 'prompt', voicePrompt: 'şimdi anlat', last: true });
  await waitFor(() => ws.sent.some(m => m.type === 'text' && m.last === true));
});

// ---------- config / env ----------
test('parseEnv ve loadJarvisConfig', () => {
  const parsed = parseEnv('# yorum\nA=1\nB="iki üç"\nexport C=3 # aciklama\nbozuk satir\n');
  assert.deepEqual(parsed, { A: '1', B: 'iki üç', C: '3' });
  assert.equal(toAddress('+90 555 111 22 33', 'whatsapp'), 'whatsapp:+905551112233');
  assert.equal(toAddress('whatsapp:+905551112233', 'phone'), '+905551112233');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-cfg-'));
  const saved = {};
  const set = (k, v) => { saved[k] = process.env[k]; if (v === undefined) delete process.env[k]; else process.env[k] = v; };
  set('JARVIS_ENABLED', '1'); set('JARVIS_PUBLIC_URL', 'https://example.ngrok.app/'); set('JARVIS_TO', '+905551112233');
  set('JARVIS_FROM', '+905550000000'); set('TWILIO_ACCOUNT_SID', 'AC1'); set('TWILIO_AUTH_TOKEN', 'tok');
  set('ANTHROPIC_API_KEY', undefined); set('JARVIS_DRY_RUN', '1'); set('JARVIS_CALL_TIME', '7:30'); set('JARVIS_CHANNEL', undefined);
  try {
    const { cfg, problems } = loadJarvisConfig(root, { server: { timezone: 'Europe/Istanbul' } });
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.publicUrl, 'https://example.ngrok.app');
    assert.equal(cfg.publicWsUrl, 'wss://example.ngrok.app');
    assert.equal(cfg.to, 'whatsapp:+905551112233');
    assert.deepEqual([cfg.schedule.hour, cfg.schedule.minute], [7, 30]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /\+90/);
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
