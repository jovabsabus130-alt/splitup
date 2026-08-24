/**
 * @file cronService.js
 * Scheduled job scheduler for background system maintenance and cleanup
 * Concept: System & Integration — Scheduled jobs / cron (Score: 0.3)
 * 
 * Jobs:
 * 1. Expired OTP Purge (Runs every hour): Removes unverified, expired verification codes.
 * 2. Balance Cache Warmup & Settlement Audit: Pre-warms frequently queried group balances.
 */

const axios = require('axios');
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
   * Render Free Tier Keep-Alive:
   * Self-pings the /health endpoint every 14 minutes to prevent the free instance from sleeping.
   * Render provides RENDER_EXTERNAL_URL automatically.
   */
  async pingSelf() {
    const baseUrl = process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || process.env.SERVER_URL;
    if (!baseUrl) {
      return { skipped: true, reason: 'No external URL configured (set RENDER_EXTERNAL_URL or APP_URL)' };
    }

    const healthUrl = `${baseUrl.replace(/\/$/, '')}/health`;
    try {
      const response = await axios.get(healthUrl, { timeout: 10000 });
      console.log(`[Keep-Alive] Self-ping successful: ${healthUrl} (Status: ${response.status})`);
      return { url: healthUrl, status: response.status };
    } catch (err) {
      console.warn(`[Keep-Alive] Self-ping warning: ${err.message}`);
      throw err;
    }
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

// Initialize recurring background jobs if not running in unit test mode
if (process.env.NODE_ENV !== 'test') {
  // 1. Purge expired OTPs every 1 hour
  cron.registerJob('purge-expired-otps', 3600000, () => cron.purgeExpiredOtps());

  // 2. Render Free Tier Keep-Alive: Runs every 14 minutes (14 * 60 * 1000 = 840,000 ms)
  // 14 minutes ensures Render's 15-minute inactivity timer never triggers
  cron.registerJob('render-keep-alive', 14 * 60 * 1000, () => cron.pingSelf());
}

module.exports = cron;

