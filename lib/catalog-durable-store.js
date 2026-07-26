'use strict';

const COMPARE_DELETE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`.trim();
const COMPARE_EXTEND_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("PEXPIRE", KEYS[1], ARGV[2])
end
return 0
`.trim();
const ACCEPT_INVALIDATION_SCRIPT = `
if redis.call("EXISTS", KEYS[1]) == 1 then
  return {0, 0}
end
redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2])
redis.call("SET", KEYS[2], ARGV[3])
local scheduled = redis.call("SET", KEYS[3], ARGV[4], "NX", "PX", ARGV[5])
if scheduled then
  return {1, 1}
end
return {1, 0}
`.trim();
const COMMIT_REFRESH_SCRIPT = `
if redis.call("GET", KEYS[3]) ~= ARGV[3] then
  return {0, 0}
end
redis.call("SET", KEYS[1], ARGV[1])
if ARGV[2] ~= "" and redis.call("GET", KEYS[2]) == ARGV[2] then
  redis.call("DEL", KEYS[2])
end
local scheduled = 0
if ARGV[4] ~= "" and redis.call("GET", KEYS[4]) == ARGV[4] then
  redis.call("DEL", KEYS[4])
  if redis.call("EXISTS", KEYS[2]) == 1 then
    local follow_up = redis.call("SET", KEYS[4], ARGV[5], "NX", "PX", ARGV[6])
    if follow_up then
      scheduled = 1
    end
  end
end
return {1, scheduled}
`.trim();

class CatalogStoreConfigurationError extends Error {
  constructor() {
    super('The durable catalog store is not configured.');
    this.name = 'CatalogStoreConfigurationError';
    this.code = 'catalog_store_not_configured';
    this.statusCode = 503;
  }
}

function serialize(value) {
  return JSON.stringify(value);
}

function deserialize(value) {
  if (value === null || value === undefined) return null;
  return JSON.parse(value);
}

function createMemoryCatalogStore(options = {}) {
  const values = new Map();
  const now = options.now || Date.now;

  function liveEntry(key) {
    const entry = values.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= now()) {
      values.delete(key);
      return null;
    }
    return entry || null;
  }

  return {
    async get(key) {
      const entry = liveEntry(key);
      if (!entry) return null;
      return structuredClone(entry.value);
    },
    async set(key, value, options = {}) {
      if (options.nx && liveEntry(key)) return false;
      values.set(key, {
        value: structuredClone(value),
        expiresAt: options.ttlMs ? now() + options.ttlMs : null
      });
      return true;
    },
    async delete(key) {
      return values.delete(key);
    },
    async ttl(key) {
      const entry = liveEntry(key);
      if (!entry) return null;
      if (entry.expiresAt === null) return -1;
      return Math.max(0, entry.expiresAt - now());
    },
    async extendIfValue(key, expectedValue, ttlMs) {
      const entry = liveEntry(key);
      if (!entry || entry.value !== expectedValue) return false;
      entry.expiresAt = now() + ttlMs;
      return true;
    },
    async deleteIfValue(key, expectedValue) {
      const entry = values.get(key);
      if (!entry || entry.value !== expectedValue) return false;
      values.delete(key);
      return true;
    },
    async acceptInvalidation(input) {
      if (liveEntry(input.webhookKey)) {
        return { accepted: false, scheduled: false };
      }
      values.set(input.webhookKey, {
        value: 'accepted',
        expiresAt: now() + input.webhookDedupeMs
      });
      values.set(input.dirtyKey, {
        value: structuredClone(input.dirtyRaw),
        expiresAt: null
      });
      const scheduled = !liveEntry(input.scheduleKey);
      if (scheduled) {
        values.set(input.scheduleKey, {
          value: input.scheduleToken,
          expiresAt: now() + input.scheduleTtlMs
        });
      }
      return { accepted: true, scheduled };
    },
    async commitRefresh(input) {
      const lease = liveEntry(input.leaseKey);
      if (!lease || lease.value !== input.leaseToken) {
        return { committed: false, scheduled: false, scheduleToken: null };
      }
      values.set(input.recordKey, {
        value: structuredClone(input.record),
        expiresAt: null
      });
      if (input.dirtyRaw) {
        const dirty = liveEntry(input.dirtyKey);
        if (dirty && dirty.value === input.dirtyRaw) values.delete(input.dirtyKey);
      }
      let scheduled = false;
      if (input.scheduleToken) {
        const schedule = liveEntry(input.scheduleKey);
        if (schedule && schedule.value === input.scheduleToken) {
          values.delete(input.scheduleKey);
          if (liveEntry(input.dirtyKey)) {
            values.set(input.scheduleKey, {
              value: input.followUpScheduleToken,
              expiresAt: now() + input.scheduleTtlMs
            });
            scheduled = true;
          }
        }
      }
      return {
        committed: true,
        scheduled,
        scheduleToken: scheduled ? input.followUpScheduleToken : null
      };
    }
  };
}

function createRedisCatalogStore(options = {}) {
  const url = String(options.url || '').replace(/\/+$/, '');
  const token = String(options.token || '');
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs || 5000;
  if (!url || !token) throw new CatalogStoreConfigurationError();
  const localTestUrl = options.allowInsecureLocalhost &&
    /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/i.test(url);
  if (!/^https:\/\//i.test(url) && !localTestUrl) {
    throw new TypeError('The durable catalog store URL must use HTTPS.');
  }

  async function command(parts) {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(parts),
      signal: AbortSignal.timeout(timeoutMs)
    });
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }
    if (!response.ok || !payload || payload.error) {
      const failure = new Error('The durable catalog store request failed.');
      failure.code = 'catalog_store_request_failed';
      failure.statusCode = response.status || 502;
      throw failure;
    }
    return payload.result;
  }

  return {
    async get(key) {
      return deserialize(await command(['GET', key]));
    },
    async set(key, value, setOptions = {}) {
      const parts = ['SET', key, serialize(value)];
      if (setOptions.nx) parts.push('NX');
      if (setOptions.ttlMs) parts.push('PX', setOptions.ttlMs);
      return await command(parts) === 'OK';
    },
    async delete(key) {
      return Number(await command(['DEL', key])) > 0;
    },
    async ttl(key) {
      const ttlMs = Number(await command(['PTTL', key]));
      return Number.isFinite(ttlMs) && ttlMs >= 0 ? ttlMs : null;
    },
    async extendIfValue(key, expectedValue, ttlMs) {
      return Number(await command([
        'EVAL',
        COMPARE_EXTEND_SCRIPT,
        1,
        key,
        serialize(expectedValue),
        ttlMs
      ])) > 0;
    },
    async deleteIfValue(key, expectedValue) {
      return Number(await command([
        'EVAL',
        COMPARE_DELETE_SCRIPT,
        1,
        key,
        serialize(expectedValue)
      ])) > 0;
    },
    async acceptInvalidation(input) {
      const result = await command([
        'EVAL',
        ACCEPT_INVALIDATION_SCRIPT,
        3,
        input.webhookKey,
        input.dirtyKey,
        input.scheduleKey,
        serialize('accepted'),
        input.webhookDedupeMs,
        serialize(input.dirtyRaw),
        serialize(input.scheduleToken),
        input.scheduleTtlMs
      ]);
      return {
        accepted: Array.isArray(result) && Number(result[0]) === 1,
        scheduled: Array.isArray(result) && Number(result[1]) === 1
      };
    },
    async commitRefresh(input) {
      const result = await command([
        'EVAL',
        COMMIT_REFRESH_SCRIPT,
        4,
        input.recordKey,
        input.dirtyKey,
        input.leaseKey,
        input.scheduleKey,
        serialize(input.record),
        input.dirtyRaw ? serialize(input.dirtyRaw) : '',
        serialize(input.leaseToken),
        input.scheduleToken ? serialize(input.scheduleToken) : '',
        input.followUpScheduleToken ? serialize(input.followUpScheduleToken) : '',
        input.scheduleTtlMs || 0
      ]);
      const committed = Array.isArray(result) && Number(result[0]) === 1;
      const scheduled = committed && Number(result[1]) === 1;
      return {
        committed,
        scheduled,
        scheduleToken: scheduled ? input.followUpScheduleToken : null
      };
    }
  };
}

function createCatalogStoreFromEnv(environment = process.env, options = {}) {
  const url = environment.KV_REST_API_URL || environment.UPSTASH_REDIS_REST_URL;
  const token = environment.KV_REST_API_TOKEN || environment.UPSTASH_REDIS_REST_TOKEN;
  return createRedisCatalogStore({
    ...options,
    url,
    token
  });
}

module.exports = {
  CatalogStoreConfigurationError,
  createCatalogStoreFromEnv,
  createRedisCatalogStore,
  createMemoryCatalogStore
};
