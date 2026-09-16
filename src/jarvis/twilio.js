// Twilio tarafi: arama baslatma, WhatsApp mesaji, izin sablonu, TwiML ve imza dogrulama.
const twilio = require('twilio');

class TwilioGateway {
  constructor(cfg, logger) {
    this.cfg = cfg;
    this.log = logger;
    const t = cfg.twilio;
    this.client = t.apiKey && t.apiSecret
      ? twilio(t.apiKey, t.apiSecret, { accountSid: t.accountSid })
      : twilio(t.accountSid, t.authToken);
  }

  url(pathname, query) {
    const qs = query ? '?' + new URLSearchParams(query).toString() : '';
    return this.cfg.publicUrl + pathname + qs;
  }

  // Isletme baslatmali arama (WhatsApp veya normal telefon)
  async placeCall({ kind = 'briefing' } = {}) {
    const call = await this.client.calls.create({
      from: this.cfg.from,
      to: this.cfg.to,
      url: this.url('/jarvis/voice', { kind }),
      method: 'POST',
      statusCallback: this.url('/jarvis/voice/status'),
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });
    this.log.info(`Arama baslatildi: ${call.sid} (${kind}) -> ${this.cfg.to}`);
    return call;
  }

  async sendMessage(body) {
    const msg = await this.client.messages.create({ from: this.cfg.from, to: this.cfg.to, body });
    this.log.info(`Mesaj gonderildi: ${msg.sid}`);
    return msg;
  }

  // WhatsApp arama izni istegi icin twilio/call-to-action sablonu (VOICE_CALL_REQUEST).
  // Bu sablon WhatsApp onayi gerektirmez; acik bir 24 saatlik oturumda gonderilebilir.
  async ensureContentTemplate(state) {
    if (this.cfg.permissionContentSid) return this.cfg.permissionContentSid;
    if (state.data.contentSid) return state.data.contentSid;
    const content = await this.client.content.v1.contents.create({
      friendlyName: 'jarvis_voice_call_request',
      language: 'tr',
      types: {
        'twilio/call-to-action': {
          body: `${this.cfg.agentName} seni arayabilsin mi?`,
          actions: [{ type: 'VOICE_CALL_REQUEST', title: 'Aramaya izin ver' }]
        }
      }
    });
    state.data.contentSid = content.sid;
    state.save();
    this.log.success(`Izin sablonu olusturuldu: ${content.sid}`);
    return content.sid;
  }

  async sendPermissionRequest(contentSid) {
    const msg = await this.client.messages.create({ from: this.cfg.from, to: this.cfg.to, contentSid });
    this.log.info(`Arama izni istegi gonderildi: ${msg.sid}`);
    return msg;
  }

  // <Connect><ConversationRelay/></Connect> TwiML'i
  buildVoiceTwiml({ kind = 'briefing', greeting = '' } = {}) {
    const v = this.cfg.voice;
    const response = new twilio.twiml.VoiceResponse();
    const connect = response.connect({ action: this.url('/jarvis/voice/ended'), method: 'POST' });
    const attrs = {
      url: this.cfg.publicWsUrl + '/jarvis/relay',
      language: v.language,
      ttsProvider: v.ttsProvider,
      transcriptionProvider: v.sttProvider,
      interruptible: 'any',
      welcomeGreetingInterruptible: 'any',
      dtmfDetection: true,
      reportInputDuringAgentSpeech: 'none'
    };
    if (v.voice) attrs.voice = v.voice;
    if (v.speechModel) attrs.speechModel = v.speechModel;
    if (greeting) attrs.welcomeGreeting = greeting;
    const relay = connect.conversationRelay(attrs);
    relay.parameter({ name: 'kind', value: kind });
    return response.toString();
  }

  hangupTwiml() {
    const response = new twilio.twiml.VoiceResponse();
    response.hangup();
    return response.toString();
  }

  validateSignature(signature, url, params) {
    if (!this.cfg.validateSignatures) return true;
    if (!signature) return false;
    return twilio.validateRequest(this.cfg.twilio.authToken, signature, url, params || {});
  }

  // WebSocket el sikismasi: Twilio X-Twilio-Signature'i istek URL'si uzerinden hesaplar.
  // Semanin wss:// mi https:// mi imzalandigina bagli kalmamak icin iki varyanti da dene.
  validateUpgrade(req) {
    if (!this.cfg.validateSignatures) return true;
    const signature = req.headers['x-twilio-signature'];
    if (!signature) return false;
    const candidates = [this.cfg.publicWsUrl + req.url, this.cfg.publicUrl + req.url];
    return candidates.some(u => twilio.validateRequest(this.cfg.twilio.authToken, signature, u, {}));
  }
}

module.exports = { TwilioGateway };
