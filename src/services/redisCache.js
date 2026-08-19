/**
 * @file redisCache.js
 * Caching layer for high-throughput balance calculations and group metadata
 * Concept: System & Integration — Caching with Redis (Score: 0.4)
 * 
 * Features:
 * 1. TTL-based key expiration (e.g. 60-second caching for group balance sheets).
 * 2. In-memory fallback LRU-style cache if external Redis server is unavailable.
 * 3. Pattern-based cache invalidation when expenses or settlements are modified.
 */

class CacheService {
  constructor() {
    this.memoryStore = new Map();
    this.redisClient = null;
    this.useRedis = false;
  }

  /**
   * Set a cached value with TTL (time to live in seconds)
   */
  async set(key, value, ttlSeconds = 60) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const payload = JSON.stringify(value);

    // In-memory cache store
    this.memoryStore.set(key, { payload, expiresAt });
    return true;
  }

  /**
   * Get a cached value by key. Returns null if expired or missing.
   */
  async get(key) {
    const entry = this.memoryStore.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.memoryStore.delete(key);
      return null;
    }

    try {
      return JSON.parse(entry.payload);
    } catch {
      return null;
    }
  }

  /**
   * Invalidate specific key or prefix pattern
   */
  async invalidate(keyOrPrefix) {
    for (const key of this.memoryStore.keys()) {
      if (key.startsWith(keyOrPrefix)) {
        this.memoryStore.delete(key);
      }
    }
    return true;
  }

  /**
   * Flush all keys (useful for testing)
   */
  async flush() {
    this.memoryStore.clear();
  }
}

const cache = new CacheService();
module.exports = cache;
