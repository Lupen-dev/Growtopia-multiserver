// Twilio ConversationRelay WebSocket koprusu.
// Twilio konusmayi metne cevirip "prompt" mesaji yollar; biz Claude'un cevabini "text" token'lari olarak
// geri yollariz, Twilio seslendirir. Kullanici araya girerse "interrupt" gelir.
const WebSocket = require('ws');
const { ReplyStreamer } = require('./textStream');

function interruptedContent(heard, fallback) {
  const base = (heard || String(fallback || '').split(' ').slice(0, 4).join(' ')).trim();
  return base + ' … (sahip araya girdi, cümle yarım kaldı)';
}

class CallSession {
  constructor({ ws, cfg, logger, brain, getSystemPrompt, onEnd, endDelayMs }) {
    this.ws = ws;
    this.cfg = cfg;
    this.log = logger;
    this.brain = brain;
    this.getSystemPrompt = getSystemPrompt;
    this.onEnd = onEnd || (() => {});
    this.endDelayMs = endDelayMs;
    this.history = [];
    this.system = '';
    this.kind = 'briefing';
    this.callSid = '';
    this.turn = 0;
    this.abort = null;
    this.busy = false;
    this.closed = false;
    this.endTimer = null;
    this.result = { reason: 'hangup', control: {} };
  }

  attach() {
    this.ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }
      this.onMessage(msg).catch(e => this.log.error('Relay mesaj hatasi: ' + (e && e.message)));
    });
    this.ws.on('close', () => this.dispose());
    this.ws.on('error', (e) => this.log.warn('Relay WS hatasi: ' + (e && e.message)));
    return this;
  }

  dispose() {
    if (this.closed) return;
    this.closed = true;
    if (this.abort) this.abort.abort();
    if (this.endTimer) clearTimeout(this.endTimer);
    this.onEnd({ callSid: this.callSid, kind: this.kind, ...this.result });
  }

  send(obj) {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) return;
    try { this.ws.send(JSON.stringify(obj)); } catch (e) { this.log.warn('Relay gonderim hatasi: ' + e.message); }
  }

  async onMessage(msg) {
    switch (msg.type) {
      case 'setup': {
        this.callSid = msg.callSid || '';
        this.kind = (msg.customParameters && msg.customParameters.kind) || 'briefing';
        this.system = await this.getSystemPrompt({ kind: this.kind, from: msg.from, to: msg.to });
        this.log.info(`Relay oturumu basladi (${this.kind}) call=${this.callSid}`);
        break;
      }
      case 'prompt': {
        if (msg.last === false) return;   // kismi transkript; tamamini bekle
        const text = String(msg.voicePrompt || '').trim();
        if (!text) return;
        await this.handlePrompt(text);
        break;
      }
      case 'interrupt': {
        this.handleInterrupt(msg);
        break;
      }
      case 'dtmf': {
        // Tuslama ile de bitirilebilsin: # veya 0 -> kapat
        if (msg.digit === '#' || msg.digit === '0') await this.handlePrompt('(tuşladı: aramayı bitir)');
        break;
      }
      case 'error': {
        this.log.warn('ConversationRelay hatasi: ' + (msg.description || JSON.stringify(msg)));
        break;
      }
      default:
        break;
    }
  }

  handleInterrupt(msg) {
    if (this.abort) this.abort.abort();
    const heard = String(msg.utteranceUntilInterrupt || '').trim();
    if (this.busy) {
      // Cevap hala uretiliyor; handlePrompt bitince gecmise "kesildi" notuyla yazar
      this.interruptedAt = heard;
    } else {
      // Cevap uretilmis, TTS okurken kesildi: gecmisteki son asistan mesajini kisalt
      const last = this.history[this.history.length - 1];
      if (last && last.role === 'assistant') last.content = interruptedContent(heard, last.content);
    }
    if (this.endTimer) { clearTimeout(this.endTimer); this.endTimer = null; }
  }

  async handlePrompt(text) {
    if (!this.system) this.system = await this.getSystemPrompt({ kind: this.kind });
    if (this.abort) this.abort.abort();
    const turn = ++this.turn;
    const controller = new AbortController();
    this.abort = controller;
    this.busy = true;
    this.interruptedAt = null;
    this.history.push({ role: 'user', content: text });

    let sentText = '';
    const streamer = new ReplyStreamer({
      onSentence: (sentence) => {
        if (turn !== this.turn || controller.signal.aborted) return;
        sentText += sentence + ' ';
        this.send({ type: 'text', token: sentence + ' ', last: false });
      }
    });

    let reply;
    try {
      reply = await this.brain.reply({
        system: this.system,
        history: this.history,
        signal: controller.signal,
        onToken: (delta) => { if (turn === this.turn) streamer.push(delta); }
      });
    } catch (e) {
      this.log.error('Claude hatasi: ' + (e && e.message));
      if (turn === this.turn) {
        this.send({ type: 'text', token: 'Bir aksaklık oldu efendim, raporu birazdan tekrar deneyebilirim.', last: true });
        this.history.push({ role: 'assistant', content: 'Bir aksaklık oldu efendim.' });
      }
      this.busy = false;
      return;
    }
    if (turn !== this.turn) return;   // araya girildi, yeni tur basladi
    const { control, spoken } = streamer.end();

    if (reply.aborted) {
      // Sahip araya girdi: sadece gercekten okunan kismi, "kesildi" notuyla gecmise yaz
      const heard = this.interruptedAt || sentText.trim();
      if (heard) this.history.push({ role: 'assistant', content: interruptedContent(heard, heard) });
      this.interruptedAt = null;
      this.busy = false;
      return;
    }
    if (reply.stopReason === 'refusal' && !spoken) {
      this.send({ type: 'text', token: 'Bunu yanıtlayamıyorum efendim.', last: false });
    }
    this.history.push({ role: 'assistant', content: spoken || reply.text || '…' });
    this.send({ type: 'text', token: '', last: true });
    this.busy = false;

    if (control.end) {
      this.result = { reason: control.snoozeMin ? 'snooze' : 'end', control };
      // Vedanin seslendirilmesi icin kisa bir sure bekle, sonra oturumu bitir
      const waitMs = this.endDelayMs !== undefined ? this.endDelayMs : Math.min(9000, 1200 + spoken.length * 70);
      this.endTimer = setTimeout(() => {
        this.send({ type: 'end', handoffData: JSON.stringify({ reason: this.result.reason, snoozeMin: control.snoozeMin || 0, kind: this.kind }) });
      }, waitMs);
    }
  }
}

class RelayServer {
  constructor({ cfg, logger, brain, gateway, getSystemPrompt, onSessionEnd, endDelayMs }) {
    this.cfg = cfg;
    this.log = logger;
    this.brain = brain;
    this.gateway = gateway;
    this.getSystemPrompt = getSystemPrompt;
    this.onSessionEnd = onSessionEnd;
    this.endDelayMs = endDelayMs;
    this.sessions = new Set();
    this.wss = new WebSocket.Server({ noServer: true, perMessageDeflate: false });
    this.wss.on('connection', (ws) => {
      const session = new CallSession({
        ws, cfg, logger, brain, getSystemPrompt,
        endDelayMs: this.endDelayMs,
        onEnd: (info) => { this.sessions.delete(session); if (this.onSessionEnd) this.onSessionEnd(info); }
      }).attach();
      this.sessions.add(session);
    });
  }

  handleUpgrade(req, socket, head) {
    if (this.gateway && !this.gateway.validateUpgrade(req)) {
      this.log.warn('Relay: gecersiz Twilio imzasi, baglanti reddedildi (' + (req.socket && req.socket.remoteAddress) + ')');
      try { socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); } catch {}
      socket.destroy();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => this.wss.emit('connection', ws, req));
  }

  close() {
    for (const s of this.sessions) try { s.ws.close(); } catch {}
    this.wss.close();
  }
}

module.exports = { RelayServer, CallSession };
