// Jarvis: sabahlari sahibi arayip gece raporunu anlatan sesli ajan.
//
// Kanal: telegram (bedava, basit)
//   1. Zamanlayici HH:MM'de tetiklenir -> (varsa) CallMeBot Telegram'i caldirip kisa ozeti okur,
//      ardindan Telegram botu raporu sesli mesaj + metin olarak yollar.
//   2. Sahip yazili veya sesli soru sorar (Groq Whisper ile yaziya cevrilir); Claude cevaplar;
//      cevap sesli mesaj (Edge TTS) + metin olarak doner.
//
// Kanal: whatsapp / phone (Twilio)
//   1. Zamanlayici -> WhatsApp arama izni varsa Twilio ile gercek sesli arama.
//   2. Twilio /jarvis/voice'tan TwiML alir: <Connect><ConversationRelay url="wss://.../jarvis/relay">.
//   3. ConversationRelay konusmayi metne cevirip WS'e yollar; Claude cevaplar; Twilio seslendirir.
//   4. "kapat" -> arama biter, "5 dakika sonra ara" -> geri arama planlanir.
//   Izin yoksa rapor WhatsApp'a metin olarak gider.
const path = require('path');
const { loadJarvisConfig } = require('./config');
const { JarvisState } = require('./state');
const { buildBriefing, briefingToText, fmtDateTime } = require('./briefing');
const { createBrain } = require('./brain');
const { TwilioGateway } = require('./twilio');
const { CallPermissions } = require('./permissions');
const { RelayServer } = require('./relay');
const { DailyScheduler } = require('./scheduler');
const { mountJarvisRoutes } = require('./routes');
const { TelegramGateway } = require('./telegram');
const { synthesize, transcribe } = require('./speech');
const { ringTelegram, ringSummary } = require('./ring');

const ROOT = path.resolve(__dirname, '..', '..');
const HOUR = 3600 * 1000;

const TELEGRAM_HELP = (agent) => [
  `${agent} hazır. Komutlar:`,
  'ara     - şimdi ara (CallMeBot açıksa telefon çalar) ve raporu sesli gönder',
  'rapor   - gece raporunu gönder',
  'durum   - ajan durumu',
  'Bunların dışında yazdığın veya sesli söylediğin her şey soru olarak cevaplanır.'
].join('\n');

class Jarvis {
  constructor(ctx, options = {}) {
    this.ctx = ctx;
    this.log = ctx.logger.child('jarvis');
    const { cfg, problems, warnings } = loadJarvisConfig(options.root || ROOT, ctx.config);
    this.cfg = cfg;
    this.problems = problems;
    this.warnings = warnings;
    this.active = false;
    this.chatHistories = new Map();   // yazisma gecmisi (gonderen -> {history, at})
    this.snoozeTimer = null;
    this.hintedChats = new Map();     // chat id ipucu verilen yabanci sohbetler (rate limit)
    this.deps = { synthesize, transcribe, ringTelegram, fetch: options.fetch, ...(options.deps || {}) };
  }

  start() {
    const cfg = this.cfg;
    if (!cfg.enabled) {
      this.log.info('Jarvis kapali. Acmak icin .env dosyasina JARVIS_ENABLED=1 yaz (bkz. docs/JARVIS_TELEGRAM.md).');
      return false;
    }
    if (this.problems.length) {
      for (const p of this.problems) this.log.error('Jarvis ayar hatasi: ' + p);
      this.log.warn('Jarvis eksik ayarlar yuzunden baslatilmadi.');
      return false;
    }
    for (const w of this.warnings) this.log.warn('Jarvis: ' + w);

    this.state = new JarvisState(this.ctx.db);
    this.brain = createBrain(cfg, this.log);

    if (cfg.channel === 'telegram') this.startTelegram();
    else this.startTwilio();

    if (this.ctx.webServer && this.ctx.webServer.app) mountJarvisRoutes(this.ctx.webServer.app, this);

    this.sampler = setInterval(() => {
      try { this.state.addSample(this.ctx.players.onlineCount()); } catch {}
    }, 5 * 60 * 1000);
    if (this.sampler.unref) this.sampler.unref();
    try { this.state.addSample(this.ctx.players.onlineCount()); } catch {}

    const modeLabel = `${cfg.channel}${cfg.dryRun ? ', deneme modu' : ''}`;
    if (cfg.schedule.enabled) {
      this.scheduler = new DailyScheduler({
        hour: cfg.schedule.hour, minute: cfg.schedule.minute, timeZone: cfg.schedule.timeZone,
        logger: this.log, onFire: () => this.morningCall()
      });
      const nextAt = this.scheduler.start();
      this.log.success(`Jarvis hazir (${modeLabel}). Sonraki arama: ${fmtDateTime(nextAt, cfg.schedule.timeZone)}${cfg.to ? ' -> ' + cfg.to : ''}`);
    } else {
      this.log.success(`Jarvis hazir (${modeLabel}), zamanlayici kapali; konsoldan "jarvis ara" ile aranir.`);
    }
    this.active = true;
    return true;
  }

  startTwilio() {
    const cfg = this.cfg;
    this.gateway = new TwilioGateway(cfg, this.log);
    this.permissions = new CallPermissions({ cfg, state: this.state, gateway: this.gateway, logger: this.log });
    this.relay = new RelayServer({
      cfg, logger: this.log, brain: this.brain, gateway: this.gateway,
      getSystemPrompt: ({ kind }) => this.systemPromptFor(kind, 'voice'),
      onSessionEnd: (info) => this.onRelaySessionEnd(info)
    });
    if (this.permissions.required) {
      const info = this.permissions.permissionInfo();
      if (!info.active) this.log.warn(`WhatsApp arama izni yok (durum: ${info.status}). Sahip bota bir mesaj yazsin, izin istegi otomatik gider; ya da konsoldan "jarvis izin".`);
    }
  }

  startTelegram() {
    const cfg = this.cfg;
    const configured = cfg.telegram.chatId;
    const numeric = /^-?\d+$/.test(configured) ? configured : (this.state.data.telegramChatId || '');
    this.telegram = new TelegramGateway({ token: cfg.telegram.token, chatId: numeric, logger: this.log, fetchImpl: this.deps.fetch });
    this.telegram.startPolling((msg) => this.onTelegramMessage(msg));
    this.telegram.getMe()
      .then(me => this.log.info(`Telegram botu: @${me.username}${numeric ? '' : ' (sahip chat ID henuz yok; bota bir mesaj yaz)'}`))
      .catch(e => this.log.error('Telegram botuna ulasilamadi (TELEGRAM_BOT_TOKEN dogru mu?): ' + (e && e.message)));
  }

  stop() {
    if (this.scheduler) this.scheduler.stop();
    if (this.sampler) clearInterval(this.sampler);
    if (this.snoozeTimer) clearTimeout(this.snoozeTimer);
    if (this.relay) this.relay.close();
    if (this.telegram) this.telegram.stopPolling();
    this.active = false;
  }

  // --- Rapor / prompt ---

  currentBriefing() {
    return buildBriefing(this.ctx, this.state, { timeZone: this.cfg.schedule.timeZone, maxWindowMs: this.cfg.briefingMaxWindowMs });
  }

  reportText(briefing) {
    return briefingToText(briefing || this.currentBriefing(), { agentName: this.cfg.agentName });
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

  markBriefingDelivered() {
    this.state.data.lastBriefingAt = Date.now();
    this.state.save();
  }

  // --- Aramalar ---

  async callNow(kind = 'manual') {
    if (!this.active) return { ok: false, reason: 'Jarvis aktif degil.' };
    if (this.cfg.channel === 'telegram') return this.telegramCall(kind);
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

  // Sabah rutini
  async morningCall() {
    this.log.info('Sabah rutini basliyor...');
    if (this.cfg.channel === 'telegram') return this.telegramCall('briefing');
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
    if (kind === 'briefing' || kind === 'callback') this.markBriefingDelivered();
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

  // --- Telegram ---

  telegramReady() {
    if (!this.telegram) return { ok: false, reason: 'Telegram kanali aktif degil.' };
    if (!this.telegram.chatId) return { ok: false, reason: 'Sahibin chat ID\'si yok: bota Telegram\'dan bir mesaj yaz.' };
    return { ok: true };
  }

  // Metin + (acikse) sesli mesaj olarak gonder
  async telegramSay(text, { voice = true } = {}) {
    const ready = this.telegramReady();
    if (!ready.ok) return ready;
    await this.telegram.sendMessage(text);
    if (voice && this.cfg.speech.tts) {
      await this.telegram.sendChatAction('record_voice');
      const audio = await this.deps.synthesize(text, { voice: this.cfg.speech.voice, logger: this.log });
      if (audio) await this.telegram.sendVoice(audio.buffer, { filename: 'jarvis.' + audio.ext, mime: audio.mime });
    }
    return { ok: true };
  }

  // Telegram "aramasi": CallMeBot ile caldir (varsa) + raporu sesli/metin gonder
  async telegramCall(kind = 'manual') {
    const briefing = this.currentBriefing();
    const text = this.reportText(briefing);
    let rang = false;
    if (this.cfg.callmebot.enabled) {
      try {
        const r = await this.deps.ringTelegram({
          user: this.cfg.callmebot.user, text: ringSummary(briefing, this.cfg.agentName),
          lang: this.cfg.callmebot.lang, rpt: this.cfg.callmebot.rpt, fetchImpl: this.deps.fetch, logger: this.log
        });
        rang = r.ok;
        this.state.recordCall({ sid: 'callmebot-' + Date.now(), kind, to: this.cfg.callmebot.user, status: r.ok ? 'queued' : 'failed' });
      } catch (e) {
        this.log.warn('CallMeBot aramasi basarisiz: ' + (e && e.message));
      }
    }
    const sent = await this.telegramSay(text).catch(e => ({ ok: false, reason: e && e.message }));
    if (!sent.ok) {
      this.log.warn('Telegram raporu gonderilemedi: ' + sent.reason);
      return { ok: rang, rang, reason: sent.reason };
    }
    if (kind === 'briefing' || kind === 'callback') this.markBriefingDelivered();
    this.log.success(`Telegram raporu gonderildi${rang ? ' (telefon calindi)' : ''}.`);
    return { ok: true, rang, kind };
  }

  isTelegramOwner(msg) {
    const configured = this.cfg.telegram.chatId;
    const chatId = String(msg.chat && msg.chat.id);
    const uname = msg.from && msg.from.username ? '@' + msg.from.username.toLowerCase() : '';
    if (!configured) return false;
    if (/^-?\d+$/.test(configured)) return configured === chatId;
    return uname && configured.toLowerCase().replace(/^@?/, '@') === uname;
  }

  async onTelegramMessage(msg) {
    if (!msg || !msg.chat) return;
    const chatId = String(msg.chat.id);
    if (!this.isTelegramOwner(msg)) {
      const last = this.hintedChats.get(chatId) || 0;
      if (Date.now() - last > HOUR) {
        this.hintedChats.set(chatId, Date.now());
        const who = msg.from && msg.from.username ? ` (@${msg.from.username})` : '';
        this.log.warn(`Telegram: tanimadigim sohbetten mesaj: chat_id=${chatId}${who}`);
        if (!this.cfg.telegram.chatId) {
          await this.telegram.sendMessage(`Merhaba. Chat ID'n: ${chatId}. Sahibi olmak için .env dosyasına TELEGRAM_CHAT_ID=${chatId} yazıp sunucuyu yeniden başlat.`, { chatId });
        }
      }
      return;
    }
    // Sahip dogrulandi: sayisal chat id'yi ogren ve sakla (zamanli gonderimler icin)
    if (this.telegram.chatId !== chatId) {
      this.telegram.chatId = chatId;
      this.state.data.telegramChatId = chatId;
      this.state.save();
    }

    let text = String(msg.text || msg.caption || '').trim();
    const voice = msg.voice || msg.audio;
    if (voice && !text) {
      if (!this.cfg.speech.groqApiKey) {
        await this.telegram.sendMessage('Sesli mesajı yazıya çevirmek için GROQ_API_KEY gerekli (console.groq.com, ücretsiz). Şimdilik yazarak sorabilirsin.');
        return;
      }
      try {
        await this.telegram.sendChatAction('typing');
        const buffer = await this.telegram.downloadFile(voice.file_id);
        text = await this.deps.transcribe(buffer, { apiKey: this.cfg.speech.groqApiKey, filename: 'voice.ogg', mime: voice.mime_type || 'audio/ogg', fetchImpl: this.deps.fetch });
      } catch (e) {
        this.log.error('Sesli mesaj cevrilemedi: ' + (e && e.message));
        await this.telegram.sendMessage('Sesli mesajı çeviremedim: ' + (e && e.message));
        return;
      }
      if (!text) { await this.telegram.sendMessage('Sesli mesajda bir şey anlayamadım.'); return; }
      await this.telegram.sendMessage(`Duyduğum: "${text}"`);
    }
    if (!text) return;

    const cmd = text.toLowerCase().replace(/^\//, '').replace(/[^a-zçğıöşü0-9 ]/gi, '').trim();
    if (cmd === 'start' || cmd === 'yardim' || cmd === 'help') { await this.telegram.sendMessage(TELEGRAM_HELP(this.cfg.agentName)); return; }
    if (cmd === 'ara' || cmd === 'beni ara') {
      const r = await this.telegramCall('manual');
      if (!r.ok) await this.telegram.sendMessage('Arayamadım: ' + r.reason);
      return;
    }
    if (cmd === 'rapor') { await this.telegramSay(this.reportText()); return; }
    if (cmd === 'durum') { await this.telegram.sendMessage(this.statusText()); return; }

    await this.telegram.sendChatAction('typing');
    try {
      const reply = await this.chatReply('telegram:' + chatId, text);
      if (reply) await this.telegramSay(reply);
    } catch (e) {
      this.log.error('Telegram sohbet hatasi: ' + (e && e.message));
      await this.telegram.sendMessage('Bir aksaklık oldu: ' + (e && e.message));
    }
  }

  // --- WhatsApp (Twilio) mesajlari ---

  async sendReport() {
    if (!this.active) return { ok: false, reason: 'Jarvis aktif degil.' };
    if (this.cfg.channel === 'telegram') {
      const r = await this.telegramSay(this.reportText()).catch(e => ({ ok: false, reason: e && e.message }));
      if (r.ok) this.markBriefingDelivered();
      return r;
    }
    try {
      const text = this.reportText();
      await this.gateway.sendMessage(text);
      this.markBriefingDelivered();
      return { ok: true };
    } catch (e) {
      this.log.error('Rapor gonderilemedi: ' + (e && e.message));
      return { ok: false, reason: 'Twilio hatasi: ' + (e && e.message) };
    }
  }

  async requestPermission(opts) {
    if (!this.active) return { ok: false, reason: 'Jarvis aktif degil.' };
    if (!this.permissions || !this.permissions.required) return { ok: false, reason: `${this.cfg.channel} kanalinda izin gerekmez.` };
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
      to: this.cfg.channel === 'telegram' ? (this.telegram && this.telegram.chatId || '') : this.cfg.to,
      from: this.cfg.from,
      callmebot: this.cfg.callmebot.enabled ? this.cfg.callmebot.user : null,
      tts: this.cfg.speech.tts,
      stt: !!this.cfg.speech.groqApiKey,
      nextCallAt: this.scheduler ? this.scheduler.nextAt : null,
      timeZone: this.cfg.schedule.timeZone,
      permission: perm,
      canCall: this.permissions ? this.permissions.canCallNow(now) : (this.telegram ? this.telegramReady() : null),
      callsLast24h: this.state ? this.state.callsLast24h(now).length : 0,
      lastBriefingAt: this.state ? this.state.data.lastBriefingAt : 0,
      consecutiveMisses: this.state ? this.state.data.consecutiveMisses : 0,
      recentCalls: this.state ? this.state.data.calls.slice(-5) : [],
      problems: this.problems,
      warnings: this.warnings
    };
  }

  statusText() {
    const s = this.status();
    const tz = this.cfg.schedule.timeZone;
    const lines = [`${this.cfg.agentName} durumu`];
    lines.push(`Kanal: ${s.channel}${s.dryRun ? ' (deneme modu)' : ''}`);
    if (s.channel === 'telegram') {
      lines.push(`Telefon çaldırma (CallMeBot): ${s.callmebot ? 'açık, ' + s.callmebot : 'kapalı'}`);
      lines.push(`Sesli mesaj: ${s.tts ? 'açık' : 'kapalı'}, sesli soru: ${s.stt ? 'açık' : 'kapalı (GROQ_API_KEY yok)'}`);
    }
    if (s.permission) lines.push(`Arama izni: ${s.permission.active ? 'var, ' + fmtDateTime(s.permission.expiresAt, tz) + ' tarihine kadar' : s.permission.status}`);
    lines.push(`Şu an arayabilir mi: ${s.canCall && s.canCall.ok ? 'evet' : 'hayır, ' + (s.canCall && s.canCall.reason)}`);
    lines.push(`Son 24 saatteki arama: ${s.callsLast24h}`);
    if (s.nextCallAt) lines.push(`Sonraki planlı arama: ${fmtDateTime(s.nextCallAt, tz)}`);
    if (s.lastBriefingAt) lines.push(`Son rapor: ${fmtDateTime(s.lastBriefingAt, tz)}`);
    return lines.join('\n');
  }
}

module.exports = { Jarvis };
