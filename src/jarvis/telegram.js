// Telegram Bot API (bedava, resmi). Ek paket yok: Node 18+ fetch/FormData ile dogrudan cagrilir.
// Webhook gerekmez: long polling ile mesajlari ceker, yani sunucuyu disari acmaya gerek yoktur.
const API = 'https://api.telegram.org';
const MAX_TEXT = 4000;

class TelegramGateway {
  constructor({ token, chatId, logger, fetchImpl }) {
    this.token = token;
    this.chatId = chatId ? String(chatId) : '';
    this.log = logger;
    this.fetch = fetchImpl || globalThis.fetch;
    this.polling = false;
    this.offset = 0;
    this.abort = null;
  }

  async api(method, params = {}, { form = false, signal } = {}) {
    const url = `${API}/bot${this.token}/${method}`;
    let res;
    if (form) {
      const fd = new FormData();
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        if (v && typeof v === 'object' && v.buffer) fd.append(k, new Blob([v.buffer], { type: v.mime || 'application/octet-stream' }), v.filename || 'file');
        else fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
      }
      res = await this.fetch(url, { method: 'POST', body: fd, signal });
    } else {
      res = await this.fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params), signal });
    }
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(`Telegram ${method}: ${data.description || res.status}`);
    return data.result;
  }

  getMe() { return this.api('getMe'); }

  async sendMessage(text, { chatId } = {}) {
    const to = chatId || this.chatId;
    if (!to) throw new Error('TELEGRAM_CHAT_ID yok');
    const parts = splitText(String(text), MAX_TEXT);
    let last = null;
    for (const part of parts) last = await this.api('sendMessage', { chat_id: to, text: part });
    return last;
  }

  sendChatAction(action = 'typing', { chatId } = {}) {
    return this.api('sendChatAction', { chat_id: chatId || this.chatId, action }).catch(() => null);
  }

  // Sesli mesaj: OGG/OPUS, MP3 veya M4A kabul edilir (Telegram bunu "voice" olarak gosterir)
  sendVoice(buffer, { chatId, caption, filename = 'jarvis.mp3', mime = 'audio/mpeg', duration } = {}) {
    return this.api('sendVoice', {
      chat_id: chatId || this.chatId,
      voice: { buffer, filename, mime },
      caption: caption ? String(caption).slice(0, 1000) : undefined,
      duration
    }, { form: true });
  }

  async downloadFile(fileId) {
    const info = await this.api('getFile', { file_id: fileId });
    const res = await this.fetch(`${API}/file/bot${this.token}/${info.file_path}`);
    if (!res.ok) throw new Error('Telegram dosya indirilemedi: ' + res.status);
    return Buffer.from(await res.arrayBuffer());
  }

  // onMessage(msg) her gelen mesaj icin cagrilir (Telegram Message nesnesi)
  startPolling(onMessage) {
    if (this.polling) return;
    this.polling = true;
    const loop = async () => {
      let backoff = 1000;
      while (this.polling) {
        this.abort = new AbortController();
        try {
          const updates = await this.api('getUpdates', { offset: this.offset, timeout: 50, allowed_updates: ['message'] }, { signal: this.abort.signal });
          backoff = 1000;
          for (const u of updates) {
            this.offset = u.update_id + 1;
            if (!u.message) continue;
            try { await onMessage(u.message); }
            catch (e) { this.log && this.log.error('Telegram mesaj isleme hatasi: ' + (e && e.message)); }
          }
        } catch (e) {
          if (!this.polling) break;
          this.log && this.log.warn('Telegram polling hatasi: ' + (e && e.message) + ` (${backoff / 1000}s sonra tekrar)`);
          await new Promise(r => setTimeout(r, backoff));
          backoff = Math.min(backoff * 2, 60000);
        }
      }
    };
    this.loopPromise = loop();
  }

  stopPolling() {
    this.polling = false;
    if (this.abort) this.abort.abort();
  }
}

function splitText(text, max) {
  if (text.length <= max) return [text];
  const parts = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = rest.lastIndexOf(' ', max);
    if (cut < max / 2) cut = max;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\s+/, '');
  }
  if (rest) parts.push(rest);
  return parts;
}

module.exports = { TelegramGateway, splitText };
