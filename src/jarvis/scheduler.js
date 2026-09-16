// Gunluk zamanlayici: verilen saat diliminde her gun HH:MM'de calisir (DST'ye dayanikli).

function zonedParts(ts, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(ts));
  const get = (t) => Number(parts.find(p => p.type === t).value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') };
}

// Belirli bir saat dilimindeki duvar saati -> UTC zaman damgasi
function wallClockToUtc(year, month, day, hour, minute, timeZone) {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const p = zonedParts(guess, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const next = guess - (asUtc - target);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

function msUntilNext(hour, minute, timeZone, now = Date.now()) {
  const p = zonedParts(now, timeZone);
  let t = wallClockToUtc(p.year, p.month, p.day, hour, minute, timeZone);
  if (t <= now) {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
    t = wallClockToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), hour, minute, timeZone);
  }
  return t - now;
}

class DailyScheduler {
  constructor({ hour, minute, timeZone, onFire, logger }) {
    this.hour = hour; this.minute = minute; this.timeZone = timeZone;
    this.onFire = onFire; this.log = logger;
    this.timer = null; this.nextAt = 0;
  }

  start() {
    this.stop();
    const ms = msUntilNext(this.hour, this.minute, this.timeZone);
    this.nextAt = Date.now() + ms;
    // setTimeout 2^31-1 ms ustunu kabul etmez; gunluk zamanlayici icin sorun degil ama yine de kirp
    this.timer = setTimeout(async () => {
      try { await this.onFire(); }
      catch (e) { this.log && this.log.error('Zamanlanmis gorev hatasi: ' + (e && e.message)); }
      finally { this.start(); }
    }, Math.min(ms, 2 ** 31 - 1));
    if (this.timer.unref) this.timer.unref();
    return this.nextAt;
  }

  stop() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
}

module.exports = { DailyScheduler, msUntilNext, wallClockToUtc, zonedParts };
