// Jarvis: sabahlari WhatsApp (veya telefon) uzerinden arayip gece raporunu anlatan sesli ajan.
//
// Akis:
//   1. Zamanlayici HH:MM'de tetiklenir -> WhatsApp arama izni varsa Twilio ile arama baslar.
//   2. Twilio /jarvis/voice'tan TwiML alir: <Connect><ConversationRelay url="wss://.../jarvis/relay">.
//   3. ConversationRelay konusmayi metne cevirip WS'e yollar; Claude cevaplar; Twilio seslendirir.
//   4. Sahip "kapat" derse arama biter, "5 dakika sonra ara" derse geri arama planlanir.
// Izin yoksa (veya arama yapilamiyorsa) rapor WhatsApp'a metin olarak gider.
const path = require('path');
const { loadJarvisConfig } = require('./config');
const { JarvisState } = require('./state');
const { buildBriefing, briefingToText } = require('./briefing');
const { createBrain } = require('./brain');
const { TwilioGateway } = require('./twilio');
const { CallPermissions } = require('./permissions');
const { RelayServer } = require('./relay');
const { DailyScheduler } = require('./scheduler');
const { mountJarvisRoutes } = require('./routes');
const { fmtDateTime } = require('./briefing');

const ROOT = path.resolve(__dirname, '..', '..');
const HOUR = 3600 * 1000;

class Jarvis {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.log = ctx.logger.child('jarvis');
    const { cfg, problems } = loadJarvisConfig(options.root || ROOT, ctx.config);
    this.cfg = cfg;
    this.problems = problems;
    this.active = false;
    this.chatHistories = new Map();   // WhatsApp yazisma gecmisi (gonderen -> {history, at})
    this.snoozeTimer = null;
  }

  start() {
    const cfg = this.cfg;
    if (!cfg.enabled) {
      this.log.info('Jarvis kapali. Acmak icin .env dosyasina JARVIS_ENABLED=1 yaz (bkz. docs/JARVIS_WHATSAPP.md).');
      return false;
    }
    if (this.problems.length) {
      for (const p of this.problems) this.log.error('Jarvis ayar hatasi: ' + p);
      this.log.warn('Jarvis eksik ayarlar yuzunden baslatilmadi.');
      return false;
    }
    this.state = new JarvisState(this.ctx.db);
    this.brain = createBrain(cfg, this.log);
    this.gateway = new TwilioGateway(cfg, this.log);
    this.permissions = new CallPermissions({ cfg, state: this.state, gateway: this.gateway, logger: this.log });
    this.relay = new RelayServer({
      cfg, logger: this.log, brain: this.brain, gateway: this.gateway,
      getSystemPrompt: ({ kind }) => this.systemPromptFor(kind, 'voice'),
      onSessionEnd: (info) => this.onRelaySessionEnd(info)
    });
    if (this.ctx.webServer && this.ctx.webServer.app) mountJarvisRoutes(this.ctx.webServer.app, this);

    this.sampler = setInterval(() => {
      try { this.state.addSample(this.ctx.players.onlineCount()); } catch {}
    }, 5 * 60 * 1000);
    if (this.sampler.unref) this.sampler.unref();
    try { this.state.addSample(this.ctx.players.onlineCount()); } catch {}

    if (cfg.schedule.enabled) {
      this.scheduler = new DailyScheduler({
        hour: cfg.schedule.hour, minute: cfg.schedule.minute, timeZone: cfg.schedule.timeZone,
        logger: this.log, onFire: () => this.morningCall()
      });
      const nextAt = this.scheduler.start();
      this.log.success(`Jarvis hazir (${cfg.channel}${cfg.dryRun ? ', deneme modu' : ''}). Sonraki arama: ${fmtDateTime(nextAt, cfg.schedule.timeZone)} -> ${cfg.to}`);
    } else {
      this.log.success(`Jarvis hazir (${cfg.channel}), zamanlayici kapali; konsoldan "jarvis ara" ile aranir.`);
    }
    if (this.permissions.required) {
      const info = this.permissions.permissionInfo();
      if (!info.active) this.log.warn(`WhatsApp arama izni yok (durum: ${info.status}). Sahip bota bir mesaj yazsin, izin istegi otomatik gider; ya da konsoldan "jarvis izin".`);
    }
    this.active = true;
    return true;
  }

  stop() {
    if (this.scheduler) this.scheduler.stop();
    if (this.sampler) clearInterval(this.sampler);
    if (this.snoozeTimer) clearTimeout(this.snoozeTimer);
    if (this.relay) this.relay.close();
    this.active = false;
  }

  // --- Rapor / prompt ---

  currentBriefing() {
    return buildBriefing(this.ctx, this.state, { timeZone: this.cfg.schedule.timeZone, maxWindowMs: this.cfg.briefingMaxWindowMs });
  }

  reportText() {
    return briefingToText(this.currentBriefing(), { agentName: this.cfg.agentName });
  }

  greetingFor(kind) {
    if (this.cfg.greeting) return this.cfg.greeting;
    const owner = this.cfg.ownerName;
    if (kind === 'callback') return `${owner}, dediğiniz gibi tekrar aradım. Raporu anlatayım mı?`;
    return `Günaydın ${owner}. Gece raporu hazır. Şimdi mi anlatayım, birkaç dakika sonra mı arayayım?`;
  }

  systemPromptFor(kind, mode) {
    return this.brain.systemPrompt({
      briefingText: this.reportText(),
      mode, kind,
      greeting: mode === 'voice' ? this.greetingFor(kind) : ''
    });
  }

  // --- Aramalar ---

  async callNow(kind = 'manual') {
    if (!this.active) return { ok: false, reason: 'Jarvis aktif degil.' };
    const gate = this.permissions.canCallNow();
    if (!gate.ok) return { ok: false, reason: gate.reason };
    try {
      const call = await this.gateway.placeCall({ kind });
      this.state.recordCall({ sid: call.sid, kind, to: this.cfg.to, status: call.status || 'queued' });
      return { ok: true, sid: call.sid, kind };
    } catch (e) {
      this.log.error('Arama baslatilamadi: ' + (e && e.message));
      return { ok: false, reason: 'Twilio hatasi: ' + (e && e.message) };
    }
  }

  // Sabah rutini: ara; aranamiyorsa metin raporu gonder ve gerekiyorsa izin iste.
  async morningCall() {
    this.log.info('Sabah rutini basliyor...');
    const r = await this.callNow('briefing');
    if (r.ok) { this.log.success(`Sabah aramasi yolda: ${r.sid}`); }
    else {
      this.log.warn('Sabah aramasi yapilamadi: ' + r.reason + ' -> rapor metin olarak gonderiliyor.');
      await this.sendReport();
    }
    if (this.permissions.shouldRenew()) {
      const p = await this.requestPermission();
      if (!p.ok) this.log.warn('Izin yenileme istegi gonderilemedi: ' + p.reason);
    }
    return r;
  }

  scheduleSnooze(minutes) {
    const min = Math.max(1, Math.min(180, Number(minutes) || 5));
    if (this.snoozeTimer) clearTimeout(this.snoozeTimer);
    this.snoozeTimer = setTimeout(async () => {
      this.snoozeTimer = null;
      const r = await this.callNow('callback');
      if (!r.ok) this.log.warn('Ertelenen geri arama yapilamadi: ' + r.reason);
    }, min * 60 * 1000);
    if (this.snoozeTimer.unref) this.snoozeTimer.unref();
    this.log.info(`Geri arama ${min} dakika sonraya planlandi.`);
    return min;
  }

  onRelaySessionEnd(info) {
    this.log.info(`Relay oturumu bitti: ${info.reason} (${info.kind}) call=${info.callSid || '?'}`);
  }

  // <Connect action> callback'i (HandoffData JSON: {reason, snoozeMin, kind})
  onSessionEnded(body) {
    let handoff = {};
    try { handoff = body.HandoffData ? JSON.parse(body.HandoffData) : {}; } catch {}
    const kind = handoff.kind || 'briefing';
    this.log.info(`Arama oturumu kapandi: status=${body.SessionStatus || '?'} sure=${body.SessionDuration || '?'}s reason=${handoff.reason || 'hangup'}`);
    if (handoff.reason === 'snooze') {
      this.scheduleSnooze(handoff.snoozeMin);
      return;
    }
    if (kind === 'briefing' || kind === 'callback') {
      this.state.data.lastBriefingAt = Date.now();
      this.state.save();
    }
  }

  onCallStatus(body) {
    const sid = body.CallSid;
    const status = body.CallStatus;
    if (sid) this.state.updateCall(sid, { status, duration: body.CallDuration ? Number(body.CallDuration) : undefined });
    if (['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(status)) {
      this.permissions.recordCallOutcome(status);
      this.log.info(`Arama sonucu: ${status}${body.CallDuration ? ' (' + body.CallDuration + 's)' : ''}`);
    }
  }

  // --- WhatsApp mesajlari ---

  async sendReport() {
    if (!this.active) return { ok: false, reason: 'Jarvis aktif degil.' };
    try {
      const text = this.reportText();
      await this.gateway.sendMessage(text);
      this.state.data.lastBriefingAt = Date.now();
      this.state.save();
      return { ok: true };
    } catch (e) {
      this.log.error('Rapor gonderilemedi: ' + (e && e.message));
      return { ok: false, reason: 'Twilio hatasi: ' + (e && e.message) };
    }
  }

  async requestPermission(opts) {
    if (!this.active) return { ok: false, reason: 'Jarvis aktif degil.' };
    if (!this.permissions.required) return { ok: false, reason: 'Telefon kanalinda izin gerekmez.' };
    try {
      return await this.permissions.request(opts);
    } catch (e) {
      this.log.error('Izin istegi gonderilemedi: ' + (e && e.message));
      return { ok: false, reason: 'Twilio hatasi: ' + (e && e.message) };
    }
  }

  async onIncomingMessage(body) {
    const from = String(body.From || '');
    if (from && from !== this.cfg.to) {
      this.log.warn(`Tanimadigim numaradan mesaj yok sayildi: ${from}`);
      return;
    }
    const perm = this.permissions.handleWebhook(body);
    if (perm.handled) {
      await this.gateway.sendMessage(perm.accepted
        ? 'Teşekkürler, arama izni alındı. Sabah aramamı bekleyin; "ara" yazarsanız hemen ararım.'
        : 'Anlaşıldı, aramayacağım. Fikriniz değişirse "izin" yazın.');
      return;
    }
    const text = String(body.Body || '').trim();
    if (!text) return;
    const cmd = text.toLowerCase().replace(/[^a-zçğıöşü0-9 ]/gi, '').trim();

    if (cmd === 'ara' || cmd === 'beni ara') {
      const r = await this.callNow('manual');
      await this.gateway.sendMessage(r.ok ? 'Arıyorum...' : 'Arayamadım: ' + r.reason);
      return;
    }
    if (cmd === 'rapor') { await this.sendReport(); return; }
    if (cmd === 'durum') { await this.gateway.sendMessage(this.statusText()); return; }
    if (cmd === 'izin' || cmd === 'jarvis') {
      const r = await this.requestPermission();
      if (!r.ok) await this.gateway.sendMessage('İzin isteği gönderilemedi: ' + r.reason);
      return;
    }
    // Izin yoksa/bitmek uzereyse acik oturumu firsat bil: once izin iste
    if (this.permissions.required && this.permissions.shouldRenew() && this.permissions.canRequestNow().ok) {
      const r = await this.requestPermission();
      if (r.ok) this.log.info('Gelen mesaj vesilesiyle arama izni istendi.');
    }
    // Serbest sohbet: Claude ile kisa yazisma
    try {
      const reply = await this.chatReply(from || 'owner', text);
      if (reply) await this.gateway.sendMessage(reply);
    } catch (e) {
      this.log.error('WhatsApp sohbet hatasi: ' + (e && e.message));
    }
  }

  async chatReply(sender, text) {
    const now = Date.now();
    let entry = this.chatHistories.get(sender);
    if (!entry || now - entry.at > HOUR) entry = { history: [], at: now };
    entry.at = now;
    entry.history.push({ role: 'user', content: text });
    if (entry.history.length > 20) entry.history.splice(0, entry.history.length - 20);
    this.chatHistories.set(sender, entry);
    const r = await this.brain.reply({ system: this.systemPromptFor('chat', 'text'), history: entry.history, maxTokens: 800 });
    const answer = (r.text || '').replace(/\[\[[^\]]*\]\]/g, '').trim();
    if (answer) entry.history.push({ role: 'assistant', content: answer });
    return answer;
  }

  // --- Durum ---

  status() {
    const now = Date.now();
    const perm = this.permissions ? this.permissions.permissionInfo(now) : null;
    return {
      active: this.active,
      channel: this.cfg.channel,
      dryRun: this.cfg.dryRun,
      to: this.cfg.to, from: this.cfg.from,
      nextCallAt: this.scheduler ? this.scheduler.nextAt : null,
      timeZone: this.cfg.schedule.timeZone,
      permission: perm,
      canCall: this.permissions ? this.permissions.canCallNow(now) : null,
      callsLast24h: this.state ? this.state.callsLast24h(now).length : 0,
      lastBriefingAt: this.state ? this.state.data.lastBriefingAt : 0,
      consecutiveMisses: this.state ? this.state.data.consecutiveMisses : 0,
      recentCalls: this.state ? this.state.data.calls.slice(-5) : [],
      problems: this.problems
    };
  }

  statusText() {
    const s = this.status();
    const tz = this.cfg.schedule.timeZone;
    const lines = [`${this.cfg.agentName} durumu`];
    lines.push(`Kanal: ${s.channel}${s.dryRun ? ' (deneme modu)' : ''}`);
    if (s.permission) lines.push(`Arama izni: ${s.permission.active ? 'var, ' + fmtDateTime(s.permission.expiresAt, tz) + ' tarihine kadar' : s.permission.status}`);
    lines.push(`Şu an arayabilir mi: ${s.canCall && s.canCall.ok ? 'evet' : 'hayır, ' + (s.canCall && s.canCall.reason)}`);
    lines.push(`Son 24 saatteki arama: ${s.callsLast24h}`);
    if (s.nextCallAt) lines.push(`Sonraki planlı arama: ${fmtDateTime(s.nextCallAt, tz)}`);
    if (s.lastBriefingAt) lines.push(`Son rapor: ${fmtDateTime(s.lastBriefingAt, tz)}`);
    return lines.join('\n');
  }
}

module.exports = { Jarvis };
