#!/usr/bin/env node
// Twilio olmadan ConversationRelay'i taklit eder: calisan sunucunun /jarvis/relay WS'ine baglanir,
// Twilio'nun yollayacagi setup/prompt/interrupt mesajlarini yollar, donen text/end mesajlarini basar.
//
// Sunucuyu su ayarlarla calistir: JARVIS_ENABLED=1 JARVIS_VALIDATE_SIGNATURES=0 (istersen JARVIS_DRY_RUN=1)
//   npm run jarvis:simulate                       # ws://localhost:8080/jarvis/relay
//   npm run jarvis:simulate -- ws://host:port/jarvis/relay
//   Yazdigin her satir "sahibin soyledigi" olur. /kes = araya gir, /cikis = kapat
const readline = require('readline');
const WebSocket = require('ws');

const url = process.argv[2] || 'ws://localhost:8080/jarvis/relay';
const ws = new WebSocket(url);
let spokenSoFar = '';
// Boru ile girdi verilirse (script/test) satirlar sirayla, cevap bitince gonderilir
const piped = !process.stdin.isTTY;
const queue = [];
let ready = false, awaiting = false;
function pump() {
  if (!ready || awaiting || !queue.length) return;
  const text = queue.shift();
  awaiting = true;
  handle(text);
}

ws.on('open', () => {
  console.log('Baglandi: ' + url);
  ready = true;
  ws.send(JSON.stringify({
    type: 'setup', sessionId: 'VX-sim', callSid: 'CA-sim', from: 'whatsapp:+10000000000', to: 'whatsapp:+905550000000',
    direction: 'outbound-api', callStatus: 'in-progress', customParameters: { kind: 'briefing' }
  }));
  console.log('[Twilio selamlamayi okudu: "Günaydın efendim. Gece raporu hazır. Şimdi mi anlatayım?"]');
  rl.prompt();
  pump();
});

ws.on('message', (raw) => {
  let msg; try { msg = JSON.parse(raw); } catch { return console.log('ham:', String(raw)); }
  if (msg.type === 'text') {
    if (msg.token) { spokenSoFar += msg.token; process.stdout.write(msg.token); }
    if (msg.last) { console.log('\n  [tur bitti]'); awaiting = false; rl.prompt(); pump(); }
  } else if (msg.type === 'end') {
    console.log('\n  [Twilio: oturum bitti] handoffData=' + (msg.handoffData || ''));
    ws.close();
  } else {
    console.log('\n  [mesaj] ' + JSON.stringify(msg));
  }
});
ws.on('close', () => { console.log('Baglanti kapandi.'); process.exit(0); });
ws.on('error', (e) => { console.error('WS hatasi: ' + e.message + ' (sunucu acik mi? JARVIS_VALIDATE_SIGNATURES=0 mi?)'); process.exit(1); });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'sahip> ' });
rl.on('line', (line) => {
  const text = line.trim();
  if (!text) return rl.prompt();
  if (piped) { queue.push(text); return pump(); }
  handle(text);
});

function handle(text) {
  if (text === '/cikis') return ws.close();
  if (text === '/kes') {
    ws.send(JSON.stringify({ type: 'interrupt', utteranceUntilInterrupt: spokenSoFar.split(' ').slice(0, 4).join(' '), durationUntilInterruptMs: 1200 }));
    spokenSoFar = '';
    console.log('  [araya girdin]');
    awaiting = false; rl.prompt();
    return pump();
  }
  spokenSoFar = '';
  ws.send(JSON.stringify({ type: 'prompt', voicePrompt: text, lang: 'tr-TR', last: true }));
}
