#!/usr/bin/env node
// Jarvis'in beyniyle terminalde konus (Twilio gerekmez, sunucu calismasa da olur).
// Ayni data/runtime verisinden gece raporunu uretir, sonra Claude ile sohbet acar.
//
//   npm run jarvis:chat            # WhatsApp yazisma modu
//   npm run jarvis:chat -- --voice # Sesli arama modu (kontrol isaretleri ve cumle akisi gosterilir)
//   Komutlar: /rapor  /cikis
const path = require('path');
const readline = require('readline');
const { createStandaloneCtx } = require('../src/jarvis/standalone');
const { loadJarvisConfig } = require('../src/jarvis/config');
const { buildBriefing, briefingToText } = require('../src/jarvis/briefing');
const { createBrain } = require('../src/jarvis/brain');
const { ReplyStreamer } = require('../src/jarvis/textStream');

async function main() {
  const ROOT = path.resolve(__dirname, '..');
  const voice = process.argv.includes('--voice');
  const ctx = createStandaloneCtx(ROOT);
  const { cfg } = loadJarvisConfig(ROOT, ctx.config);
  if (!cfg.anthropicApiKey && !cfg.dryRun) {
    console.error('ANTHROPIC_API_KEY yok. .env dosyasina ekle ya da JARVIS_DRY_RUN=1 ile dene.');
    process.exit(1);
  }
  const brain = createBrain(cfg, ctx.logger.child('jarvis'));
  const briefing = buildBriefing(ctx, null, { timeZone: cfg.schedule.timeZone });
  const report = briefingToText(briefing, { agentName: cfg.agentName });
  const kind = 'briefing';
  const greeting = voice ? `Günaydın ${cfg.ownerName}. Gece raporu hazır. Şimdi mi anlatayım?` : '';
  const system = brain.systemPrompt({ briefingText: report, mode: voice ? 'voice' : 'text', kind, greeting });
  const history = [];

  console.log('=== GECE RAPORU ===\n' + report + '\n');
  console.log(voice ? `[Jarvis]: ${greeting}` : '[Jarvis hazir, yaz]');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'sen> ' });
  rl.prompt();
  rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) return rl.prompt();
    if (text === '/cikis' || text === '/exit') return rl.close();
    if (text === '/rapor') { console.log(report); return rl.prompt(); }
    history.push({ role: 'user', content: text });
    process.stdout.write('[Jarvis]: ');
    let streamer = null;
    if (voice) streamer = new ReplyStreamer({ onSentence: s => process.stdout.write('«' + s + '» ') });
    try {
      const r = await brain.reply({
        system, history,
        onToken: (t) => voice ? streamer.push(t) : process.stdout.write(t),
        maxTokens: voice ? 600 : 800
      });
      let content = r.text;
      if (voice) {
        const { control, spoken } = streamer.end();
        content = spoken;
        if (control.end) console.log(`\n  -> kontrol: ${control.snoozeMin ? 'ERTELE ' + control.snoozeMin + ' dk' : 'KAPAT'}`);
      }
      if (content) history.push({ role: 'assistant', content });
      console.log('');
    } catch (e) {
      console.log('\nHata: ' + e.message);
    }
    rl.prompt();
  });
  rl.on('close', () => process.exit(0));
}

main().catch(e => { console.error(e); process.exit(1); });
