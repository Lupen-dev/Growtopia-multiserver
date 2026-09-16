// Claude'dan akan metni cumle cumle TTS'e verir ve kontrol isaretlerini ayiklar.
//
// Kontrol isaretleri cevabin EN BASINDA gelir:
//   [[KAPAT]]      -> bu cevaptan sonra aramayi bitir
//   [[ERTELE:5]]   -> aramayi bitir, 5 dakika sonra tekrar ara
// Isaretler hicbir zaman seslendirilmez.

const MARKER_RE = /\[\[\s*([A-ZÇĞİÖŞÜa-zçğıöşü]+)\s*(?::\s*(\d{1,3}))?\s*\]\]/g;

function parseControl(text) {
  const control = {};
  const cleaned = String(text).replace(MARKER_RE, (_, name, num) => {
    const key = name.toUpperCase().replace('İ', 'I');
    if (key === 'KAPAT' || key === 'END') control.end = true;
    else if (key === 'ERTELE' || key === 'SNOOZE') { control.end = true; control.snoozeMin = Math.max(1, Math.min(180, Number(num) || 5)); }
    return '';
  });
  return { control, text: cleaned };
}

// Markdown ve TTS'in okuyamayacagi karakterleri temizle
function sanitizeForSpeech(text) {
  return String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>|]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

class ReplyStreamer {
  constructor({ onSentence, minFlush = 24, maxBuffer = 160 } = {}) {
    this.onSentence = onSentence || (() => {});
    this.minFlush = minFlush;
    this.maxBuffer = maxBuffer;
    this.buf = '';
    this.decided = false;   // bastaki isaret cozuldu mu?
    this.control = {};
    this.sentences = [];
    this.spoken = '';
  }

  push(chunk) {
    if (!chunk) return;
    this.buf += chunk;
    if (!this.decided) this.decideLeading();
    if (this.decided) this.flush(false);
  }

  decideLeading() {
    const t = this.buf.replace(/^\s+/, '');
    if (!t) return;
    if (t.startsWith('[[') || t === '[') {
      const close = t.indexOf(']]');
      if (close < 0) {
        if (t.length > 48) { this.decided = true; }   // isaret degilmis, normal metin
        return;
      }
      const { control, text } = parseControl(t.slice(0, close + 2));
      Object.assign(this.control, control);
      this.buf = text + t.slice(close + 2);
      this.decided = true;
      this.decideLeading();   // arka arkaya birden fazla isaret olabilir
      return;
    }
    this.decided = true;
  }

  // Cumle sonu (. ! ? …) + bosluk gorunce o kismi seslendir.
  flush(final) {
    let text = this.buf;
    // Tamamlanmamis bir isaret varsa o noktaya kadar konus
    const open = text.lastIndexOf('[[');
    if (open >= 0 && text.indexOf(']]', open) < 0) {
      if (!final) text = text.slice(0, open);
    }
    let emitUpTo = -1;
    if (final) {
      emitUpTo = text.length;
    } else {
      const re = /[.!?…]+["'”)\]]*\s+/g;
      let m;
      while ((m = re.exec(text))) emitUpTo = m.index + m[0].length;
      if (emitUpTo < this.minFlush) emitUpTo = -1;
      if (emitUpTo < 0 && text.length > this.maxBuffer) {
        const ws = text.lastIndexOf(' ');
        if (ws > this.minFlush) emitUpTo = ws + 1;
      }
    }
    if (emitUpTo <= 0) return;
    const raw = text.slice(0, emitUpTo);
    this.buf = this.buf.slice(emitUpTo);
    const parsed = parseControl(raw);
    Object.assign(this.control, parsed.control);
    const sentence = sanitizeForSpeech(parsed.text);
    if (sentence) {
      this.sentences.push(sentence);
      this.spoken += (this.spoken ? ' ' : '') + sentence;
      this.onSentence(sentence);
    }
  }

  end() {
    if (!this.decided) { this.decided = true; }
    this.flush(true);
    this.buf = '';
    return { control: { ...this.control }, spoken: this.spoken, sentences: [...this.sentences] };
  }
}

module.exports = { ReplyStreamer, parseControl, sanitizeForSpeech };
