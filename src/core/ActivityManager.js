class ActivityManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.log = ctx.logger.child('activities');
    this.modules = {};
    this.timers = [];
  }

  register(name, mod) {
    this.modules[name] = mod;
    if (typeof mod.init === 'function') mod.init(this.ctx);
    this.log.info(`activity yuklendi: ${name}`);
  }
  get(name) { return this.modules[name]; }
  list() { return Object.keys(this.modules); }

  schedulePeriodic() {
    const cfg = this.ctx.config.activities;
    this.timers.push(setInterval(() => this.modules.lottery && this.modules.lottery.draw(), cfg.lotteryDrawIntervalMin * 60000));
    this.timers.push(setInterval(() => this.modules.quiz && this.modules.quiz.start(), cfg.quizIntervalMin * 60000));
    this.timers.push(setInterval(() => this.modules.parkour && this.modules.parkour.start(), cfg.parkourIntervalMin * 60000));
    this.timers.push(setInterval(() => this.modules.bossraid && this.modules.bossraid.start(), cfg.bossRaidIntervalMin * 60000));
  }
  stopAll() { for (const t of this.timers) clearInterval(t); this.timers = []; }
}

module.exports = ActivityManager;
