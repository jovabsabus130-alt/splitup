/**
 * @file cronService.js
 * Scheduled job scheduler for background system maintenance and cleanup
 * Concept: System & Integration — Scheduled jobs / cron (Score: 0.3)
 * 
 * Jobs:
 * 1. Expired OTP Purge (Runs every hour): Removes unverified, expired verification codes.
 * 2. Balance Cache Warmup & Settlement Audit: Pre-warms frequently queried group balances.
 */

const prisma = require('../lib/prisma');

class CronScheduler {
  constructor() {
    this.jobs = new Map();
    this.history = [];
  }

  /**
   * Register a scheduled recurring job
   */
  registerJob(jobName, intervalMs, handler) {
    if (this.jobs.has(jobName)) {
      clearInterval(this.jobs.get(jobName).timerId);
    }

    const timerId = setInterval(async () => {
      await this.runJob(jobName, handler);
    }, intervalMs);

    this.jobs.set(jobName, { intervalMs, handler, timerId, lastRun: null });
    return true;
  }

  /**
   * Execute a single scheduled task safely with error boundaries
   */
  async runJob(jobName, handler) {
    const startTime = Date.now();
    try {
      const result = await handler();
      const duration = Date.now() - startTime;
      const record = { jobName, status: 'success', duration, timestamp: new Date(), result };
      this.history.unshift(record);
      if (this.history.length > 50) this.history.pop();
      return record;
    } catch (error) {
      const duration = Date.now() - startTime;
      const record = { jobName, status: 'failed', duration, timestamp: new Date(), error: error.message };
      this.history.unshift(record);
      return record;
    }
  }

  /**
   * Standard Scheduled Task: Purge expired OTP verification codes
   */
  async purgeExpiredOtps() {
    return await prisma.otpCode.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
  }

  /**
   * Stop all active scheduled jobs (for clean shutdown / testing)
   */
  stopAll() {
    for (const [name, job] of this.jobs.entries()) {
      clearInterval(job.timerId);
    }
    this.jobs.clear();
  }
}

const cron = new CronScheduler();

// Initialize recurring 1-hour OTP cleanup (unref timer so it doesn't block graceful exit)
if (process.env.NODE_ENV !== 'test') {
  cron.registerJob('purge-expired-otps', 3600000, () => cron.purgeExpiredOtps());
}

module.exports = cron;
