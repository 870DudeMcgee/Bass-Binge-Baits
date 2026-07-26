'use strict';

const { createHash, randomUUID } = require('node:crypto');

const DEFAULT_TTL_MS = 45 * 1000;
const DEFAULT_STALE_MS = 5 * 60 * 1000;
const DEFAULT_LEASE_MS = 60 * 1000;
const DEFAULT_DEBOUNCE_MS = 250;
const DEFAULT_WEBHOOK_DEDUPE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_NAMESPACE = 'bass-binge:catalog:v2';

class CatalogUnavailableError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'CatalogUnavailableError';
    this.code = 'shopify_catalog_unavailable';
    this.statusCode = 503;
    this.details = details;
  }
}

function createCatalogService(options = {}) {
  const store = options.store;
  const loadCatalog = options.loadCatalog;
  const now = options.now || Date.now;
  const createId = options.createId || randomUUID;
  const ttlMs = options.ttlMs || DEFAULT_TTL_MS;
  const staleMs = options.staleMs || DEFAULT_STALE_MS;
  const leaseMs = options.leaseMs || DEFAULT_LEASE_MS;
  const debounceMs = options.debounceMs || DEFAULT_DEBOUNCE_MS;
  const webhookDedupeMs = options.webhookDedupeMs || DEFAULT_WEBHOOK_DEDUPE_MS;
  const namespace = options.namespace || DEFAULT_NAMESPACE;
  const logger = options.logger || console;
  const delay = options.delay || ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  const scheduledRetryMs = options.scheduledRetryMs || DEFAULT_DEBOUNCE_MS;
  const maxScheduledRefreshAttempts = Number.isInteger(options.maxScheduledRefreshAttempts)
    ? Math.max(1, options.maxScheduledRefreshAttempts)
    : 2;
  const recordKey = `${namespace}:envelope`;
  const dirtyKey = `${namespace}:dirty`;
  const refreshScheduleKey = `${namespace}:refresh-schedule`;
  const refreshLeaseKey = `${namespace}:refresh-lease`;

  if (
    !store ||
    typeof store.get !== 'function' ||
    typeof store.set !== 'function' ||
    typeof store.commitRefresh !== 'function' ||
    typeof store.ttl !== 'function' ||
    typeof store.extendIfValue !== 'function' ||
    typeof store.deleteIfValue !== 'function'
  ) {
    throw new TypeError(
      'createCatalogService requires a durable store with fenced commitRefresh and compare-delete'
    );
  }
  if (typeof loadCatalog !== 'function') {
    throw new TypeError('createCatalogService requires loadCatalog');
  }

  function ageMs(record, observedAt) {
    const refreshedAt = Date.parse(record && record.lastSuccessfulRefreshAt || '');
    return Number.isFinite(refreshedAt) ? Math.max(0, observedAt - refreshedAt) : Infinity;
  }

  function decorate(record, observedAt, cache, freshnessStatus, state = {}) {
    const age = ageMs(record, observedAt);
    const result = {
      ...record.envelope,
      requestId: createId(),
      cache,
      available: freshnessStatus !== 'unavailable',
      lastSuccessfulRefreshAt: record.lastSuccessfulRefreshAt,
      dirty: Boolean(state.dirty),
      dirtyAt: state.dirtyAt || null,
      refreshDueAt: state.refreshDueAt || null,
      stale: freshnessStatus === 'stale',
      freshness: {
        ...record.envelope.freshness,
        status: freshnessStatus,
        ageSeconds: Number.isFinite(age) ? Math.floor(age / 1000) : null,
        ttlSeconds: ttlMs / 1000,
        staleWindowSeconds: staleMs / 1000
      }
    };
    if (freshnessStatus === 'stale') {
      const observedAtIso = new Date(observedAt).toISOString();
      const staleIssue = {
        productId: null,
        handle: null,
        severity: 'warning',
        code: 'shopify_upstream_stale',
        field: null,
        message: 'Serving a recent catalog because Shopify is temporarily unavailable.',
        remedy: 'Retry after Shopify Storefront API connectivity recovers.',
        variantId: null,
        observedAt: observedAtIso
      };
      result.quarantine = [...(record.envelope.quarantine || []), staleIssue];
      result.outcomes = {
        ...(record.envelope.outcomes || {}),
        warning: [
          ...((record.envelope.outcomes && record.envelope.outcomes.warning) || []),
          staleIssue
        ]
      };
      result.legacy = {
        ...(record.envelope.legacy || {}),
        errors: [
          ...((record.envelope.legacy && record.envelope.legacy.errors) || []),
          { code: staleIssue.code, message: staleIssue.message }
        ]
      };
    }
    return result;
  }

  async function preserveScheduleOwnership(scheduleToken, ttlMs) {
    const extended = await store.extendIfValue(
      refreshScheduleKey,
      scheduleToken,
      ttlMs
    );
    if (!extended) {
      await store.set(refreshScheduleKey, scheduleToken, {
        nx: true,
        ttlMs
      });
    }
  }

  async function refresh(request, observedAt, refreshOptions = {}) {
    const leaseToken = createId();
    const acquired = await store.set(refreshLeaseKey, leaseToken, {
      nx: true,
      ttlMs: leaseMs
    });
    if (!acquired) {
      const remainingLeaseMs = await store.ttl(refreshLeaseKey);
      throw new CatalogUnavailableError('Catalog refresh is already in progress.', {
        reason: 'refresh_in_progress',
        retryAfterMs: Number.isFinite(remainingLeaseMs)
          ? remainingLeaseMs
          : scheduledRetryMs
      });
    }

    try {
      const generatedAt = new Date(observedAt).toISOString();
      const envelope = await loadCatalog(request, {
        generatedAt,
        generationId: createId(),
        requestId: createId()
      });
      const record = {
        envelope,
        lastSuccessfulRefreshAt: new Date(now()).toISOString()
      };
      const followUpScheduleToken = refreshOptions.scheduleToken ? createId() : null;
      const transition = await store.commitRefresh({
        recordKey,
        record,
        dirtyKey,
        dirtyRaw: refreshOptions.dirtyRaw || null,
        leaseKey: refreshLeaseKey,
        leaseToken,
        scheduleKey: refreshScheduleKey,
        scheduleToken: refreshOptions.scheduleToken || null,
        followUpScheduleToken,
        scheduleTtlMs: debounceMs + leaseMs
      });
      if (!transition.committed) {
        throw new CatalogUnavailableError('Catalog refresh ownership was lost.', {
          reason: 'refresh_lease_lost'
        });
      }
      return {
        catalog: decorate(record, observedAt, refreshOptions.cache || 'miss', 'fresh'),
        followUpScheduleToken: transition.scheduled ? transition.scheduleToken : null
      };
    } finally {
      if (typeof store.deleteIfValue === 'function') {
        try {
          await store.deleteIfValue(refreshLeaseKey, leaseToken);
        } catch (error) {
          logger.error('Catalog refresh lease release failed', { message: error.message });
        }
      }
    }
  }

  async function markDirty(event) {
    const observedAt = now();
    const markedAt = new Date(observedAt).toISOString();
    const dirty = {
      token: createId(),
      webhookId: event && event.webhookId || null,
      topic: event && event.topic || null,
      markedAt,
      dueAt: new Date(observedAt + debounceMs).toISOString()
    };
    const dirtyRaw = JSON.stringify(dirty);
    await store.set(dirtyKey, dirtyRaw);
    const scheduleToken = createId();
    const scheduled = await store.set(refreshScheduleKey, scheduleToken, {
      nx: true,
      ttlMs: debounceMs + leaseMs
    });
    return {
      dirty,
      scheduled,
      scheduleToken: scheduled ? scheduleToken : null
    };
  }

  return {
    async getCatalog(request) {
      const observedAt = now();
      const record = await store.get(recordKey);
      const dirtyRaw = await store.get(dirtyKey);
      const dirty = dirtyRaw ? JSON.parse(dirtyRaw) : null;
      if (
        record &&
        ageMs(record, observedAt) < ttlMs &&
        (!dirty || Date.parse(dirty.dueAt) > observedAt)
      ) {
        return decorate(record, observedAt, 'hit', 'fresh', {
          dirty: Boolean(dirty),
          dirtyAt: dirty && dirty.markedAt,
          refreshDueAt: dirty && dirty.dueAt
        });
      }

      try {
        return (await refresh(request, observedAt, { dirtyRaw })).catalog;
      } catch (error) {
        if (record && ageMs(record, observedAt) < staleMs) {
          return decorate(record, observedAt, 'stale', 'stale', {
            dirty: Boolean(dirty),
            dirtyAt: dirty && dirty.markedAt,
            refreshDueAt: dirty && dirty.dueAt
          });
        }
        if (error instanceof CatalogUnavailableError) throw error;
        throw new CatalogUnavailableError('No validated catalog is available.', {
          reason: record ? 'stale_window_expired' : 'no_last_known_good',
          cause: error.message
        });
      }
    },

    markDirty,

    async acceptInvalidation(event) {
      const webhookId = String(event && event.webhookId || '');
      const topic = String(event && event.topic || '');
      if (!webhookId || !topic) {
        throw new TypeError('acceptInvalidation requires webhookId and topic');
      }
      const webhookKey = `${namespace}:webhook:${createHash('sha256')
        .update(webhookId)
        .digest('hex')}`;
      const observedAt = now();
      const dirty = {
        token: createId(),
        webhookId,
        topic,
        markedAt: new Date(observedAt).toISOString(),
        dueAt: new Date(observedAt + debounceMs).toISOString()
      };
      const scheduleToken = createId();
      const accepted = typeof store.acceptInvalidation === 'function'
        ? await store.acceptInvalidation({
            webhookKey,
            dirtyKey,
            scheduleKey: refreshScheduleKey,
            dirtyRaw: JSON.stringify(dirty),
            scheduleToken,
            webhookDedupeMs,
            scheduleTtlMs: debounceMs + leaseMs
          })
        : {
            accepted: await store.set(webhookKey, 'accepted', {
              nx: true,
              ttlMs: webhookDedupeMs
            }),
            scheduled: false
          };
      if (!accepted.accepted) {
        return {
          duplicate: true,
          scheduled: false,
          scheduleToken: null
        };
      }
      if (typeof store.acceptInvalidation !== 'function') {
        const marked = await markDirty({ webhookId, topic });
        accepted.scheduled = marked.scheduled;
        if (marked.scheduleToken) accepted.scheduleToken = marked.scheduleToken;
      }
      return {
        duplicate: false,
        scheduled: accepted.scheduled,
        scheduleToken: accepted.scheduled
          ? (accepted.scheduleToken || scheduleToken)
          : null
      };
    },

    async runScheduledRefresh(request, scheduleToken) {
      let activeScheduleToken = scheduleToken;
      let refreshed = null;
      while (activeScheduleToken) {
        let attempts = 0;
        while (attempts < maxScheduledRefreshAttempts) {
          const dirtyRaw = await store.get(dirtyKey);
          if (!dirtyRaw) {
            if (typeof store.deleteIfValue === 'function') {
              await store.deleteIfValue(refreshScheduleKey, activeScheduleToken);
            }
            return refreshed;
          }
          const dirty = JSON.parse(dirtyRaw);
          const dueDelayMs = Math.max(0, Date.parse(dirty.dueAt) - now());
          if (dueDelayMs > 0) await delay(dueDelayMs);
          try {
            const outcome = await refresh(request, now(), {
              cache: 'refresh',
              dirtyRaw,
              scheduleToken: activeScheduleToken
            });
            refreshed = outcome.catalog;
            activeScheduleToken = outcome.followUpScheduleToken;
            break;
          } catch (error) {
            attempts += 1;
            const retryAfterMs = Number(error && error.details && error.details.retryAfterMs);
            const retryDelayMs = Number.isFinite(retryAfterMs)
              ? retryAfterMs
              : scheduledRetryMs;
            const hasRetry = attempts < maxScheduledRefreshAttempts;
            await preserveScheduleOwnership(
              activeScheduleToken,
              (hasRetry ? retryDelayMs : 0) + leaseMs + debounceMs
            );
            if (!hasRetry) throw error;
            await delay(retryDelayMs);
          }
        }
      }
      return refreshed;
    },

    async reconcile(request) {
      const dirtyRaw = await store.get(dirtyKey);
      return (await refresh(request, now(), {
        cache: 'reconcile',
        dirtyRaw
      })).catalog;
    },

    async getHealthState() {
      const observedAt = now();
      const record = await store.get(recordKey);
      const dirtyRaw = await store.get(dirtyKey);
      const dirty = dirtyRaw ? JSON.parse(dirtyRaw) : null;
      if (!record) {
        return {
          ok: false,
          available: false,
          schemaVersion: 2,
          generationId: null,
          generatedAt: null,
          sourceUpdatedAt: null,
          requestId: createId(),
          lastSuccessfulRefreshAt: null,
          dirty: Boolean(dirty),
          dirtyAt: dirty && dirty.markedAt || null,
          refreshDueAt: dirty && dirty.dueAt || null,
          stale: false,
          freshness: {
            status: 'unavailable',
            ageSeconds: null,
            ttlSeconds: ttlMs / 1000,
            staleWindowSeconds: staleMs / 1000
          },
          products: [],
          quarantine: [],
          outcomes: {
            accepted: [],
            warning: [],
            variantBlocked: [],
            productQuarantined: []
          }
        };
      }
      const age = ageMs(record, observedAt);
      const status = age < ttlMs ? 'fresh' : age < staleMs ? 'stale' : 'unavailable';
      return decorate(record, observedAt, 'health', status, {
        dirty: Boolean(dirty),
        dirtyAt: dirty && dirty.markedAt,
        refreshDueAt: dirty && dirty.dueAt
      });
    }
  };
}

module.exports = {
  CatalogUnavailableError,
  createCatalogService
};
