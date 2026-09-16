// Jarvis'in kalici durumu: data/runtime/jarvis.json (Database auto-save ile kaydedilir)
const DAY = 24 * 3600 * 1000;

const DEFAULT = () => ({
  permission: { status: 'none', requestedAt: 0, respondedAt: 0, expiresAt: 0 },
  permissionRequests: [],   // izin istegi zaman damgalari
  calls: [],                // { sid, at, kind, status, to }
  samples: [],              // { ts, online } - 5 dakikada bir online sayisi
  lastBriefingAt: 0,
  contentSid: '',
  consecutiveMisses: 0
});

class JarvisState {
  constructor(db) {
    this.db = db;
    this.data = db.load('jarvis', DEFAULT());
    // Eski dosyalarda eksik alan varsa tamamla
    const base = DEFAULT();
    for (const k of Object.keys(base)) if (this.data[k] === undefined) this.data[k] = base[k];
  }

  save() { this.db.mark('jarvis'); }

  recordCall(entry) {
    this.data.calls.push({ status: 'queued', ...entry, at: entry.at || Date.now() });
    if (this.data.calls.length > 200) this.data.calls.splice(0, this.data.calls.length - 200);
    this.save();
  }

  updateCall(sid, patch) {
    const c = this.data.calls.find(x => x.sid === sid);
    if (!c) return null;
    Object.assign(c, patch);
    this.save();
    return c;
  }

  callsSince(ts) { return this.data.calls.filter(c => c.at >= ts); }
  callsLast24h(now = Date.now()) { return this.callsSince(now - DAY); }

  addSample(online, now = Date.now()) {
    this.data.samples.push({ ts: now, online });
    const cutoff = now - 2 * DAY;
    while (this.data.samples.length && this.data.samples[0].ts < cutoff) this.data.samples.shift();
    if (this.data.samples.length > 1000) this.data.samples.splice(0, this.data.samples.length - 1000);
    this.save();
  }

  peakOnline(since) {
    let peak = 0, peakAt = 0;
    for (const s of this.data.samples) {
      if (s.ts >= since && s.online > peak) { peak = s.online; peakAt = s.ts; }
    }
    return { peak, peakAt };
  }

  permissionRequestsSince(ts) { return this.data.permissionRequests.filter(t => t >= ts); }

  setPermission(patch) {
    Object.assign(this.data.permission, patch);
    this.save();
  }
}

module.exports = { JarvisState, DAY };
