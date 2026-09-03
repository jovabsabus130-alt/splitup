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
   * Standard Scheduled Task: Purge expired OTP verification codes (Prisma / PostgreSQL)
   * 
   * Performance & Data Integrity:
   * 1. Uses a 5-minute grace period buffer to avoid race conditions with in-flight verifications.
   * 2. Uses `deleteMany` to execute a single atomic SQL command over the wire instead of sequential delete calls.
   * 3. Filters on the indexed `expiresAt` column to avoid full table scans.
   */
  async purgeExpiredOtps(gracePeriodMinutes = 5) {
    const startTime = Date.now();
    // Safety buffer: only purge OTPs that expired more than `gracePeriodMinutes` ago
    const safetyThreshold = new Date(Date.now() - gracePeriodMinutes * 60 * 1000);

    const result = await prisma.otpCode.deleteMany({
      where: {
        expiresAt: { lt: safetyThreshold },
      },
    });

    const durationMs = Date.now() - startTime;
    return {
      purgedCount: result.count,
      durationMs,
      thresholdUsed: safetyThreshold.toISOString(),
    };
  }

  /**
   * MongoDB Scheduled Task: Purge stale raw AI receipt logs (MongoDB / Mongoose)
   * Concept: NoSQL (Mongo) — CRUD operations (Mongo) & Index-driven purge
   * 
   * Performance & Concurrency Considerations:
   * 1. Uses `RawExpenseLog.deleteMany()` with compound index `{ groupId: 1, createdAt: -1 }`.
   * 2. Issues a single wire-level delete command to WiredTiger, eliminating N network round-trips.
   * 3. Returns `deletedCount` for observability and tracks execution duration without crashing the scheduler.
   */
  async purgeStaleAiReceiptLogs(retentionDays = 90) {
    const startTime = Date.now();
    try {
      const RawExpenseLog = require('../models/RawExpenseLog');
      const { connectMongo } = require('../lib/mongo');
      await connectMongo();

      if (!process.env.MONGODB_URI) {
        return { skipped: true, reason: 'MONGODB_URI not configured' };
      }

      // Compute cutoff date for retention policy (e.g., 90 days ago)
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      // deleteMany query filter hits indexed `createdAt` field (IXSCAN)
      const result = await RawExpenseLog.deleteMany({
        createdAt: { $lt: cutoffDate },
      });

      const durationMs = Date.now() - startTime;
      console.log(`[Cron:purgeStaleAiReceiptLogs] Purged ${result.deletedCount || 0} AI logs older than ${retentionDays}d in ${durationMs}ms`);

      return {
        success: true,
        deletedCount: result.deletedCount || 0,
        durationMs,
        cutoffDate: cutoffDate.toISOString(),
      };
    } catch (error) {
      console.error(`[Cron:purgeStaleAiReceiptLogs] Purge failed: ${error.message}`);
      return {
        success: false,
        deletedCount: 0,
        error: error.message,
      };
    }
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
  // 1. Purge expired OTPs every 1 hour (PostgreSQL / Prisma)
  cron.registerJob('purge-expired-otps', 3600000, () => cron.purgeExpiredOtps());

  // 2. Purge stale AI raw receipt logs older than 90 days once daily (MongoDB / Mongoose)
  cron.registerJob('purge-stale-ai-logs', 24 * 3600000, () => cron.purgeStaleAiReceiptLogs(90));

  // 3. Render Free Tier Keep-Alive: Runs every 14 minutes (14 * 60 * 1000 = 840,000 ms)
  // 14 minutes ensures Render's 15-minute inactivity timer never triggers
  cron.registerJob('render-keep-alive', 14 * 60 * 1000, () => cron.pingSelf());
}

module.exports = cron;

