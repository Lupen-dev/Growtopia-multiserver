// Bedava ses katmani:
//   - TTS: Microsoft Edge okuma servisi (msedge-tts, hesap/anahtar gerekmez, resmi olmayan istemci)
//   - STT: Groq Whisper (ucretsiz katman, kredi karti istemez) - sadece sesli mesajla soru sormak icin gerekir
const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MAX_TTS_CHARS = 3000;

async function synthesize(text, { voice = 'tr-TR-EmelNeural', logger, ttsImpl } = {}) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TTS_CHARS);
  if (!clean) return null;
  try {
    if (ttsImpl) return await ttsImpl(clean, voice);
    const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(clean);
      const chunks = [];
      for await (const c of audioStream) chunks.push(c);
      const buffer = Buffer.concat(chunks);
      if (!buffer.length) throw new Error('bos ses');
      return { buffer, ext: 'mp3', mime: 'audio/mpeg' };
    } finally {
      try { tts.close(); } catch {}
    }
  } catch (e) {
    logger && logger.warn('TTS uretilemedi, metinle devam: ' + (e && e.message));
    return null;
  }
}

async function transcribe(buffer, { apiKey, filename = 'voice.ogg', mime = 'audio/ogg', language = 'tr', fetchImpl } = {}) {
  if (!apiKey) throw new Error('GROQ_API_KEY yok (sesli mesajlari yaziya cevirmek icin gerekli)');
  const fd = new FormData();
  fd.append('file', new Blob([buffer], { type: mime }), filename);
  fd.append('model', 'whisper-large-v3-turbo');
  fd.append('language', language);
  fd.append('response_format', 'json');
  const res = await (fetchImpl || globalThis.fetch)(GROQ_URL, { method: 'POST', headers: { authorization: `Bearer ${apiKey}` }, body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Groq STT hatasi: ' + (data.error && data.error.message || res.status));
  return String(data.text || '').trim();
}

module.exports = { synthesize, transcribe, MAX_TTS_CHARS };
