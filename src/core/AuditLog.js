class AuditLog {
  constructor(db, logger) {
    this.db = db;
    this.log = logger.child('audit');
    this.data = db.load('audit', { entries: [] });
  }
  record(action, by, target, detail) {
    this.data.entries.push({ ts: Date.now(), action, by, target: target || null, detail: detail || null });
    if (this.data.entries.length > 5000) this.data.entries.splice(0, this.data.entries.length - 5000);
    this.db.mark('audit');
    this.log.event(`${by} -> ${action}${target ? ' ' + target : ''}`, detail || undefined);
  }
  recent(n = 100, filter) {
    let arr = this.data.entries;
    if (filter && filter.by) arr = arr.filter(e => e.by === filter.by);
    if (filter && filter.action) arr = arr.filter(e => e.action === filter.action);
    return arr.slice(-n).reverse();
  }
}
module.exports = AuditLog;
