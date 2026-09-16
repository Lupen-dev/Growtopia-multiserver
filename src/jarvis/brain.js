// Jarvis'in beyni: Claude API (streaming). Sesli arama ve WhatsApp metin modu ayni siniftan gecer.
const Anthropic = require('@anthropic-ai/sdk');
const { fmtDateTime } = require('./briefing');

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

function buildSystemPrompt({ cfg, briefingText, mode, kind, greeting, now, channelLabel }) {
  const tz = cfg.schedule.timeZone;
  const agent = cfg.agentName;
  const owner = cfg.ownerName;
  const lines = [];
  lines.push(`Sen ${agent}'sin: bir Growtopia özel sunucusunun yapay zeka operatörüsün. Sunucunun sahibiyle konuşuyorsun; ona "${owner}" diye hitap et.`);
  lines.push(`Şu an ${fmtDateTime(now, tz)} (${tz}).`);
  lines.push('');
  if (mode === 'voice') {
    lines.push('KANAL: Sesli telefon araması. Söylediklerin anında sese çevrilip okunur.');
    lines.push('- Kısa ve net konuş: bir seferde en fazla 3-4 cümle. Sahip soru sorunca sadece o soruya cevap ver.');
    lines.push('- Markdown, liste, emoji, başlık, tırnak içinde teknik terim kullanma. Düz konuşma dili, Türkçe.');
    lines.push('- Sayıları rakamla yaz (38 e-posta gibi), saatleri "6:40" biçiminde yaz.');
    lines.push('- Rapordaki verilerin dışına çıkma, uydurma. Bilmiyorsan "raporda yok" de.');
    lines.push('- Ton: sakin, güvenilir, hafif esprili bir uşak. Filmlerdeki Jarvis gibi ama kısa.');
    if (greeting) lines.push(`- Arama başında sana ait şu selamlama otomatik okundu: "${greeting}". Sahibin ilk sözü buna cevaptır.`);
    if (kind === 'callback') lines.push('- Bu, sahibin isteğiyle ertelenmiş bir geri aramadır; lafı uzatmadan rapora geç.');
    lines.push('- "Şimdi anlat" derse raporu en önemli 3-4 noktayla özetle, sonra "Sormak istediğin bir şey var mı?" diye sor.');
    lines.push('');
    lines.push('KONTROL İŞARETLERİ (asla seslendirilmez, cevabının EN BAŞINA yazılır):');
    lines.push('- Sahip vedalaşır, "yeter", "kapat", "tamam sağ ol" gibi bitirmek isterse: cevabına [[KAPAT]] ile başla, ardından tek cümlelik kısa veda.');
    lines.push('- Sahip "5 dakika sonra ara", "sonra ara" gibi ertelemek isterse: cevabına [[ERTELE:5]] ile başla (dakikayı sahibin dediği gibi yaz, söylemediyse 5), ardından tek cümlelik onay.');
    lines.push('- Bu işaretleri başka hiçbir durumda yazma. İşaret olmadan cevap verirsen arama devam eder.');
  } else {
    const label = channelLabel || (cfg.channel === 'telegram' ? 'Telegram' : 'WhatsApp');
    lines.push(`KANAL: ${label} yazışması. Cevabın sesli mesaj olarak da okunabilir: kısa, düz metin, konuşma dili.`);
    lines.push('- Markdown, emoji, başlık ve madde işareti kullanma; gerekirse kısa cümleler art arda.');
    lines.push('- Rapordaki verilerin dışına çıkma, uydurma. Bilmiyorsan "raporda yok" de.');
    lines.push('- Sahip aranmak isterse "ara" yazmasının yeterli olduğunu söyle.');
  }
  lines.push('');
  lines.push('GECE RAPORU (tek bilgi kaynağın budur):');
  lines.push(briefingText);
  return lines.join('\n');
}

class JarvisBrain {
  constructor(cfg, logger) {
    this.cfg = cfg;
    this.log = logger;
    this.client = new Anthropic({ apiKey: cfg.anthropicApiKey });
    this.fallbacksOn = cfg.fallbacks !== false;
  }

  systemPrompt(args) { return buildSystemPrompt({ cfg: this.cfg, now: Date.now(), ...args }); }

  requestParams({ system, history, maxTokens }) {
    const params = {
      model: this.cfg.model,
      max_tokens: maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: history,
      thinking: { type: 'adaptive' },
      output_config: { effort: this.cfg.effort }
    };
    if (this.fallbacksOn) {
      params.betas = [FALLBACK_BETA];
      params.fallbacks = 'default';
    }
    return params;
  }

  // history: [{role, content}] (Anthropic MessageParam). onToken: metin parcasi geldikce.
  // Donus: { text, stopReason, aborted }
  async reply({ system, history, onToken, signal, maxTokens = 600 }) {
    let text = '';
    const collect = (delta) => { text += delta; if (onToken) onToken(delta); };
    try {
      return await this.runStream({ system, history, maxTokens, signal, collect });
    } catch (err) {
      if (err instanceof Anthropic.APIUserAbortError || (signal && signal.aborted)) {
        return { text, stopReason: 'aborted', aborted: true };
      }
      // Fallback parametresi bu hesapta/surumde kabul edilmiyorsa kapat ve tekrar dene
      if (this.fallbacksOn && err instanceof Anthropic.BadRequestError && /fallback|beta/i.test(err.message || '')) {
        this.log.warn('Claude fallback parametresi reddedildi, fallback kapatilarak devam ediliyor: ' + err.message);
        this.fallbacksOn = false;
        text = '';
        return this.runStream({ system, history, maxTokens, signal, collect });
      }
      throw err;
    }
  }

  async runStream({ system, history, maxTokens, signal, collect }) {
    const params = this.requestParams({ system, history, maxTokens });
    const stream = this.client.beta.messages.stream(params, signal ? { signal } : undefined);
    stream.on('text', collect);
    const final = await stream.finalMessage();
    const text = final.content.filter(b => b.type === 'text').map(b => b.text).join('');
    if (final.stop_reason === 'refusal') {
      this.log.warn('Claude cevabi reddetti', final.stop_details || undefined);
    }
    return { text, stopReason: final.stop_reason, aborted: false, usage: final.usage };
  }
}

// API anahtari olmadan boru hattini test etmek icin (JARVIS_DRY_RUN=1).
class EchoBrain {
  constructor(cfg, logger) { this.cfg = cfg; this.log = logger; }
  systemPrompt(args) { return buildSystemPrompt({ cfg: this.cfg, now: Date.now(), ...args }); }
  async reply({ system, history, onToken, signal }) {
    const last = history[history.length - 1];
    const said = (last && typeof last.content === 'string' ? last.content : '').toLowerCase();
    let text;
    if (/görüşürüz|gorusuruz|kapat|yeter|sağ ol|sag ol|bay bay/.test(said)) text = '[[KAPAT]] Görüşürüz efendim, iyi günler.';
    else if (/sonra ara|dakika/.test(said)) text = '[[ERTELE:5]] Tamam efendim, 5 dakika sonra tekrar arıyorum.';
    else {
      const report = system.split('GECE RAPORU (tek bilgi kaynağın budur):')[1] || '';
      const first = report.trim().split('\n').slice(2, 6).join(' ');
      text = `Deneme modundayım efendim. Rapor özeti: ${first} Sormak istediğiniz bir şey var mı?`;
    }
    for (const word of text.split(/(?<=\s)/)) {
      if (signal && signal.aborted) return { text, stopReason: 'aborted', aborted: true };
      await new Promise(r => setTimeout(r, 15));
      if (onToken) onToken(word);
    }
    return { text, stopReason: 'end_turn', aborted: false };
  }
}

function createBrain(cfg, logger) {
  return cfg.dryRun ? new EchoBrain(cfg, logger) : new JarvisBrain(cfg, logger);
}

module.exports = { JarvisBrain, EchoBrain, createBrain, buildSystemPrompt };
