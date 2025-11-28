import { createClient } from 'redis';

// Simple Redis-backed cache with in-memory fallback.
// Usage: import cache from './cache.js'; await cache.init(); await cache.set(key, value, ttl);

let client = null;
let ready = false;
const mem = new Map();
const expiries = new Map();
let cleanupTimer = null;

async function init() {
  const url = process.env.REDIS_URL || process.env.REDIS;
  if (url) {
    try {
      client = createClient({ url });
      client.on('error', (err) => console.warn('Redis client error', err));
      await client.connect();
      ready = true;
      console.log('✅ Redis connected');
      return;
    } catch (e) {
      console.warn('⚠️ Failed to connect to Redis, falling back to in-memory cache:', e.message);
      client = null;
      ready = false;
    }
  }

  // Start simple in-memory cleanup
  if (!cleanupTimer) {
    cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [k, exp] of expiries.entries()) {
        if (exp <= now) {
          mem.delete(k);
          expiries.delete(k);
        }
      }
    }, 5000);
  }
}

async function get(key) {
  if (ready && client) {
    try {
      const v = await client.get(key);
      return v === null ? null : v;
    } catch (e) {
      console.warn('Redis get error', e.message);
      return null;
    }
  }
  const val = mem.get(key);
  if (!val) return null;
  const exp = expiries.get(key) || 0;
  if (exp && exp <= Date.now()) {
    mem.delete(key);
    expiries.delete(key);
    return null;
  }
  return val;
}

async function mget(keys) {
  if (ready && client) {
    try {
      const vals = await client.mGet(keys);
      // redis.mGet returns array of values or nulls
      return vals;
    } catch (e) {
      console.warn('Redis mget error', e.message);
      return keys.map(() => null);
    }
  }
  return keys.map((k) => mem.get(k) ?? null);
}

async function set(key, value, ttlSec = 300) {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  if (ready && client) {
    try {
      if (ttlSec && ttlSec > 0) {
        await client.set(key, str, { EX: ttlSec });
      } else {
        await client.set(key, str);
      }
      return true;
    } catch (e) {
      console.warn('Redis set error', e.message);
      // fallback to mem
    }
  }
  mem.set(key, str);
  if (ttlSec && ttlSec > 0) {
    expiries.set(key, Date.now() + ttlSec * 1000);
  } else {
    expiries.delete(key);
  }
  return true;
}

async function del(key) {
  if (ready && client) {
    try {
      await client.del(key);
      return true;
    } catch (e) {
      console.warn('Redis del error', e.message);
    }
  }
  mem.delete(key);
  expiries.delete(key);
  return true;
}

async function close() {
  if (ready && client) {
    try {
      await client.disconnect();
    } catch (e) {
      // ignore
    }
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

export default {
  init,
  get,
  mget,
  set,
  del,
  close,
  isReady: () => ready,
};
