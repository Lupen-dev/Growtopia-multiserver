// Express rotalari: Twilio webhook'lari + admin API
const Perms = require('../core/Permissions');

function mountJarvisRoutes(app, jarvis) {
  const { cfg, gateway, log } = jarvis;

  const verifyTwilio = (req, res, next) => {
    const url = cfg.publicUrl + req.originalUrl;
    if (gateway.validateSignature(req.get('x-twilio-signature'), url, req.body)) return next();
    log.warn(`Gecersiz Twilio imzasi: ${req.method} ${req.originalUrl}`);
    res.status(403).send('bad signature');
  };

  const requireAdmin = (req, res, next) => {
    const token = req.headers['x-auth'] || req.query.token;
    const web = jarvis.ctx.webServer;
    const sess = token && web && web.auth.validate(token);
    if (!sess || !Perms.atLeast(sess.role, 'admin')) return res.status(401).json({ error: 'admin auth required' });
    req.session = sess;
    next();
  };

  // Twilio arama baslayinca TwiML ister
  app.post('/jarvis/voice', verifyTwilio, (req, res) => {
    const kind = String(req.query.kind || 'briefing');
    res.type('text/xml').send(gateway.buildVoiceTwiml({ kind, greeting: jarvis.greetingFor(kind) }));
  });

  // ConversationRelay oturumu bitince (<Connect action>)
  app.post('/jarvis/voice/ended', verifyTwilio, (req, res) => {
    jarvis.onSessionEnded(req.body || {});
    res.type('text/xml').send(gateway.hangupTwiml());
  });

  // Arama durum callback'i (ringing / answered / completed ...)
  app.post('/jarvis/voice/status', verifyTwilio, (req, res) => {
    jarvis.onCallStatus(req.body || {});
    res.sendStatus(204);
  });

  // WhatsApp gelen mesaj webhook'u (izin cevabi + komutlar + sohbet)
  app.post('/jarvis/whatsapp', verifyTwilio, (req, res) => {
    res.type('text/xml').send('<Response></Response>');
    jarvis.onIncomingMessage(req.body || {}).catch(e => log.error('WhatsApp mesaj isleme hatasi: ' + (e && e.message)));
  });

  // Admin API (web panel token'i ile)
  app.get('/jarvis/status', requireAdmin, (req, res) => res.json(jarvis.status()));
  app.post('/jarvis/call', requireAdmin, async (req, res) => {
    const r = await jarvis.callNow((req.body && req.body.kind) || 'manual');
    res.status(r.ok ? 200 : 409).json(r);
  });
  app.post('/jarvis/permission', requireAdmin, async (req, res) => {
    const r = await jarvis.requestPermission();
    res.status(r.ok ? 200 : 409).json(r);
  });
  app.post('/jarvis/report', requireAdmin, async (req, res) => {
    const r = await jarvis.sendReport();
    res.status(r.ok ? 200 : 409).json(r);
  });
  app.get('/jarvis/report', requireAdmin, (req, res) => res.type('text/plain').send(jarvis.reportText()));
}

module.exports = { mountJarvisRoutes };
