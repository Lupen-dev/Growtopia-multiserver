// WhatsApp isletme baslatmali arama izni (Meta kurallari):
//  - Isletme once "arama izni istegi" gonderir, kullanici WhatsApp'ta "izin ver"e basar.
//  - Izin 7 gun gecerli; bu surede 24 saatte en fazla 5 arama.
//  - Izin istegi 24 saatte 1, 7 gunde 2 kez gonderilebilir.
//  - 4 ardisik cevapsiz arama izni otomatik iptal eder.
// Normal telefon kanalinda izin gerekmez.
const { DAY } = require('./state');

const MISSED = new Set(['no-answer', 'busy', 'failed', 'canceled']);

class CallPermissions {
  constructor({ cfg, state, gateway, logger }) {
    this.cfg = cfg;
    this.state = state;
    this.gateway = gateway;
    this.log = logger;
  }

  get required() { return this.cfg.channel === 'whatsapp'; }

  permissionInfo(now = Date.now()) {
    const p = this.state.data.permission;
    const expired = p.status === 'accepted' && p.expiresAt && p.expiresAt <= now;
    return { ...p, expired, active: p.status === 'accepted' && !expired };
  }

  canCallNow(now = Date.now()) {
    const used = this.state.callsLast24h(now).length;
    const limit = this.cfg.limits.callsPerDay;
    if (used >= limit) return { ok: false, reason: `Günlük arama limiti dolu (${used}/${limit}).` };
    if (!this.required) return { ok: true, remaining: limit - used };
    const p = this.permissionInfo(now);
    if (p.status === 'none') return { ok: false, reason: 'WhatsApp arama izni henüz istenmedi.' };
    if (p.status === 'pending') return { ok: false, reason: 'WhatsApp arama izni bekleniyor, kullanıcı henüz onaylamadı.' };
    if (p.status === 'rejected') return { ok: false, reason: 'Kullanıcı WhatsApp arama iznini reddetti.' };
    if (p.expired) return { ok: false, reason: 'WhatsApp arama izninin 7 günlük süresi doldu, yeniden izin gerekli.' };
    return { ok: true, remaining: limit - used };
  }

  canRequestNow(now = Date.now()) {
    if (!this.required) return { ok: false, reason: 'Telefon kanalında izin istenmez.' };
    const day = this.state.permissionRequestsSince(now - DAY).length;
    const week = this.state.permissionRequestsSince(now - 7 * DAY).length;
    if (day >= this.cfg.limits.permissionRequestsPerDay) return { ok: false, reason: 'Son 24 saatte zaten izin istendi.' };
    if (week >= this.cfg.limits.permissionRequestsPerWeek) return { ok: false, reason: 'Son 7 günde 2 izin isteği hakkı kullanıldı.' };
    return { ok: true };
  }

  // Izin bitmek uzere mi / yok mu? (gunluk aramadan sonra yenileme kararinda kullanilir)
  shouldRenew(now = Date.now()) {
    if (!this.required) return false;
    const p = this.permissionInfo(now);
    if (p.status === 'pending' && now - p.requestedAt < DAY) return false;
    if (p.active && p.expiresAt - now > DAY) return false;
    return true;
  }

  async request({ force = false } = {}) {
    const now = Date.now();
    const gate = this.canRequestNow(now);
    if (!gate.ok && !force) return { ok: false, reason: gate.reason };
    const contentSid = await this.gateway.ensureContentTemplate(this.state);
    const msg = await this.gateway.sendPermissionRequest(contentSid);
    this.state.data.permissionRequests.push(now);
    if (this.state.data.permissionRequests.length > 20) this.state.data.permissionRequests.splice(0, this.state.data.permissionRequests.length - 20);
    this.state.setPermission({ status: 'pending', requestedAt: now });
    return { ok: true, sid: msg.sid };
  }

  // Twilio mesaj webhook'undan gelen izin cevabi. Body=VOICE_CALL_REQUEST, ButtonPayload=ACCEPTED|REJECTED
  handleWebhook(body = {}) {
    const payload = String(body.ButtonPayload || '').toUpperCase();
    const isPermission = String(body.Body || '').toUpperCase() === 'VOICE_CALL_REQUEST' || payload === 'ACCEPTED' || payload === 'REJECTED';
    if (!isPermission) return { handled: false };
    const now = Date.now();
    if (payload === 'ACCEPTED') {
      this.state.setPermission({ status: 'accepted', respondedAt: now, expiresAt: now + this.cfg.limits.permissionDays * DAY });
      this.state.data.consecutiveMisses = 0;
      this.state.save();
      this.log.success('WhatsApp arama izni ONAYLANDI (7 gun gecerli).');
      return { handled: true, accepted: true };
    }
    this.state.setPermission({ status: 'rejected', respondedAt: now, expiresAt: 0 });
    this.log.warn('WhatsApp arama izni REDDEDILDI.');
    return { handled: true, accepted: false };
  }

  // Arama durum callback'i: cevapsiz aramalari say (4 ardisik -> Meta izni iptal eder)
  recordCallOutcome(status) {
    if (!status) return;
    if (status === 'completed') this.state.data.consecutiveMisses = 0;
    else if (MISSED.has(status)) {
      this.state.data.consecutiveMisses = (this.state.data.consecutiveMisses || 0) + 1;
      if (this.required && this.state.data.consecutiveMisses >= 4) {
        this.state.setPermission({ status: 'none', expiresAt: 0 });
        this.log.warn('4 ardisik cevapsiz arama: WhatsApp izni Meta tarafinda iptal edilmis sayiliyor, yeniden izin gerekli.');
      }
    }
    this.state.save();
  }
}

module.exports = { CallPermissions };
