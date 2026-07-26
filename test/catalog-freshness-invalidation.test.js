'use strict';

const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const test = require('node:test');

const {
  createMemoryCatalogStore,
  createRedisCatalogStore
} = require('../lib/catalog-durable-store.js');
const { createCatalogService } = require('../lib/catalog-freshness.js');
const {
  DEFAULT_TOPICS,
  createCatalogWebhookHandler
} = require('../lib/catalog-webhook.js');

function fixtureEnvelope() {
  return {
    ok: true,
    source: 'shopify',
    schemaVersion: 2,
    generatedAt: null,
    sourceUpdatedAt: '2026-07-26T12:00:00.000Z',
    generationId: null,
    requestId: null,
    freshness: { status: 'fresh', ageSeconds: 0, ttlSeconds: 45 },
    stale: false,
    products: [],
    quarantine: [],
    outcomes: {
      accepted: [],
      warning: [],
      variantBlocked: [],
      productQuarantined: []
    },
    legacy: { ok: true, products: [], errors: [] }
  };
}

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('independent catalog instances read one durable generation', async () => {
  const store = createMemoryCatalogStore();
  const now = () => Date.parse('2026-07-26T16:00:00.000Z');
  let loads = 0;
  const loadCatalog = async (request, options) => {
    loads += 1;
    return {
      ...fixtureEnvelope(),
      generatedAt: options.generatedAt,
      generationId: options.generationId,
      requestId: options.requestId
    };
  };
  const firstInstance = createCatalogService({
    store,
    loadCatalog,
    now,
    createId: () => 'generation-shared'
  });
  const secondInstance = createCatalogService({
    store,
    loadCatalog: async () => {
      throw new Error('second instance must use the durable generation');
    },
    now,
    createId: () => 'request-second'
  });

  const first = await firstInstance.getCatalog({ headers: {} });
  const second = await secondInstance.getCatalog({ headers: {} });

  assert.equal(loads, 1);
  assert.equal(first.generationId, 'generation-shared');
  assert.equal(second.generationId, 'generation-shared');
  assert.equal(second.generatedAt, first.generatedAt);
  assert.equal(second.lastSuccessfulRefreshAt, '2026-07-26T16:00:00.000Z');
  assert.equal(second.cache, 'hit');
  assert.equal(second.freshness.status, 'fresh');
});

test('valid events mark the shared generation dirty and schedule one full refresh', async () => {
  const store = createMemoryCatalogStore();
  let observedAt = Date.parse('2026-07-26T16:00:00.000Z');
  let loads = 0;
  let nextId = 0;
  const service = createCatalogService({
    store,
    now: () => observedAt,
    createId: () => `fixture-${++nextId}`,
    debounceMs: 250,
    loadCatalog: async (request, options) => {
      loads += 1;
      return {
        ...fixtureEnvelope(),
        generatedAt: options.generatedAt,
        generationId: options.generationId,
        requestId: options.requestId
      };
    }
  });

  const initial = await service.getCatalog({ headers: {} });
  const firstEvent = await service.markDirty({
    webhookId: 'webhook-1',
    topic: 'products/update'
  });
  const secondEvent = await service.markDirty({
    webhookId: 'webhook-2',
    topic: 'inventory_levels/update'
  });

  assert.equal(firstEvent.scheduled, true);
  assert.equal(secondEvent.scheduled, false);
  assert.equal(loads, 1);

  observedAt += 250;
  const refreshed = await service.runScheduledRefresh({ headers: {} }, firstEvent.scheduleToken);

  assert.equal(loads, 2);
  assert.notEqual(refreshed.generationId, initial.generationId);
  assert.equal(refreshed.cache, 'refresh');
  assert.equal(refreshed.dirty, false);
});

test('a valid Shopify event is verified from raw bytes and defers one refresh', async () => {
  const secret = 'fixture-webhook-secret';
  const rawBody = Buffer.from('{"id":123,"title":"payload facts are ignored"}');
  const signature = createHmac('sha256', secret).update(rawBody).digest('base64');
  const deferred = [];
  const invalidations = [];
  const handler = createCatalogWebhookHandler({
    getSecret: () => secret,
    acceptInvalidation: async (event) => {
      invalidations.push(event);
      return { duplicate: false, scheduled: true, scheduleToken: 'schedule-1' };
    },
    runScheduledRefresh: async () => ({ generationId: 'generation-2' }),
    defer(promise) {
      deferred.push(promise);
    },
    delay: async () => {}
  });
  const response = responseRecorder();

  await handler({
    method: 'POST',
    headers: {
      'x-shopify-hmac-sha256': signature,
      'x-shopify-webhook-id': 'webhook-valid-1',
      'x-shopify-topic': 'products/update',
      'x-shopify-shop-domain': 'bassbingebaits.myshopify.com'
    },
    rawBody
  }, response);

  assert.equal(response.statusCode, 202);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(invalidations, [{
    webhookId: 'webhook-valid-1',
    topic: 'products/update'
  }]);
  assert.equal(deferred.length, 1);
  await deferred[0];
});

test('duplicate webhook IDs are acknowledged without duplicate refresh scheduling', async () => {
  const service = createCatalogService({
    store: createMemoryCatalogStore(),
    loadCatalog: async () => fixtureEnvelope(),
    createId: (() => {
      let id = 0;
      return () => `dedupe-${++id}`;
    })()
  });

  const first = await service.acceptInvalidation({
    webhookId: 'same-shopify-delivery',
    topic: 'products/update'
  });
  const duplicate = await service.acceptInvalidation({
    webhookId: 'same-shopify-delivery',
    topic: 'products/update'
  });

  assert.equal(first.duplicate, false);
  assert.equal(first.scheduled, true);
  assert.deepEqual(duplicate, {
    duplicate: true,
    scheduled: false,
    scheduleToken: null
  });
});

test('invalid Shopify HMAC requests are rejected before invalidation', async () => {
  let invalidations = 0;
  const handler = createCatalogWebhookHandler({
    getSecret: () => 'correct-secret',
    acceptInvalidation: async () => {
      invalidations += 1;
      return { duplicate: false, scheduled: true };
    },
    runScheduledRefresh: async () => {},
    defer() {}
  });
  const response = responseRecorder();

  await handler({
    method: 'POST',
    headers: {
      'x-shopify-hmac-sha256': createHmac('sha256', 'wrong-secret')
        .update('{}')
        .digest('base64'),
      'x-shopify-webhook-id': 'invalid-hmac',
      'x-shopify-topic': 'products/update',
      'x-shopify-shop-domain': 'bassbingebaits.myshopify.com'
    },
    rawBody: Buffer.from('{}')
  }, response);

  assert.equal(response.statusCode, 401);
  assert.equal(response.body.code, 'catalog_webhook_invalid_hmac');
  assert.equal(invalidations, 0);
});

test('webhook admission covers product, publication, and inventory freshness events', () => {
  [
    'products/create',
    'products/update',
    'products/delete',
    'product_publications/create',
    'product_publications/update',
    'product_publications/delete',
    'inventory_items/create',
    'inventory_items/update',
    'inventory_items/delete',
    'inventory_levels/connect',
    'inventory_levels/update',
    'inventory_levels/disconnect'
  ].forEach((topic) => assert.equal(DEFAULT_TOPICS.has(topic), true, topic));
});

test('upstream failure serves only the bounded validated generation', async () => {
  const store = createMemoryCatalogStore();
  const startedAt = Date.parse('2026-07-26T16:00:00.000Z');
  let observedAt = startedAt;
  let upstreamAvailable = true;
  const service = createCatalogService({
    store,
    now: () => observedAt,
    ttlMs: 45 * 1000,
    staleMs: 5 * 60 * 1000,
    loadCatalog: async (request, options) => {
      if (!upstreamAvailable) throw new Error('fixture upstream failure');
      return {
        ...fixtureEnvelope(),
        generatedAt: options.generatedAt,
        generationId: options.generationId
      };
    }
  });

  const fresh = await service.getCatalog({ headers: {} });
  upstreamAvailable = false;
  observedAt = startedAt + 46 * 1000;
  const stale = await service.getCatalog({ headers: {} });

  assert.equal(stale.generationId, fresh.generationId);
  assert.equal(stale.cache, 'stale');
  assert.equal(stale.stale, true);
  assert.equal(stale.freshness.status, 'stale');

  observedAt = startedAt + 5 * 60 * 1000 + 1;
  await assert.rejects(
    service.getCatalog({ headers: {} }),
    (error) => error.code === 'shopify_catalog_unavailable' &&
      error.details.reason === 'stale_window_expired'
  );
});

test('periodic reconciliation replaces a fresh generation after a missed event', async () => {
  let observedAt = Date.parse('2026-07-26T16:00:00.000Z');
  let nextId = 0;
  let loads = 0;
  const service = createCatalogService({
    store: createMemoryCatalogStore(),
    now: () => observedAt,
    createId: () => `reconcile-${++nextId}`,
    loadCatalog: async (request, options) => {
      loads += 1;
      return {
        ...fixtureEnvelope(),
        generatedAt: options.generatedAt,
        generationId: options.generationId
      };
    }
  });

  const before = await service.getCatalog({ headers: {} });
  observedAt += 1000;
  const after = await service.reconcile({ headers: {} });

  assert.equal(loads, 2);
  assert.notEqual(after.generationId, before.generationId);
  assert.equal(after.cache, 'reconcile');
});

test('the production durable store uses atomic Redis claims and compare-delete', async () => {
  const commands = [];
  const fetchImpl = async (url, options) => {
    const command = JSON.parse(options.body);
    commands.push(command);
    if (command[0] === 'GET') {
      return {
        ok: true,
        json: async () => ({ result: '{"generationId":"shared"}' })
      };
    }
    if (command[0] === 'SET' && command.includes('NX')) {
      return { ok: true, json: async () => ({ result: 'OK' }) };
    }
    if (command[0] === 'EVAL') {
      return { ok: true, json: async () => ({ result: 1 }) };
    }
    return { ok: true, json: async () => ({ result: 'OK' }) };
  };
  const store = createRedisCatalogStore({
    url: 'https://fixture.upstash.io',
    token: 'fixture-token',
    fetchImpl
  });

  assert.deepEqual(await store.get('catalog'), { generationId: 'shared' });
  assert.equal(await store.set('webhook', 'accepted', { nx: true, ttlMs: 5000 }), true);
  assert.equal(await store.deleteIfValue('lease', 'fixture-lease'), true);
  assert.equal(await store.commitRefresh({
    recordKey: 'catalog',
    record: { generationId: 'next' },
    dirtyKey: 'dirty',
    dirtyRaw: '{"token":"dirty-1"}'
  }), true);
  assert.deepEqual(commands[1], [
    'SET',
    'webhook',
    '"accepted"',
    'NX',
    'PX',
    5000
  ]);
  assert.equal(commands[2][0], 'EVAL');
  assert.equal(commands[2][2], 1);
  assert.equal(commands[2][3], 'lease');
  assert.equal(commands[2][4], '"fixture-lease"');
  assert.equal(commands[3][0], 'EVAL');
  assert.equal(commands[3][2], 2);
  assert.equal(commands[3][3], 'catalog');
  assert.equal(commands[3][4], 'dirty');
});

test('durable health state reports fresh, stale, and unavailable windows truthfully', async () => {
  const startedAt = Date.parse('2026-07-26T16:00:00.000Z');
  let observedAt = startedAt;
  const service = createCatalogService({
    store: createMemoryCatalogStore(),
    now: () => observedAt,
    ttlMs: 45 * 1000,
    staleMs: 5 * 60 * 1000,
    createId: () => 'health-generation',
    loadCatalog: async (request, options) => ({
      ...fixtureEnvelope(),
      generatedAt: options.generatedAt,
      generationId: options.generationId
    })
  });

  await service.getCatalog({ headers: {} });
  const fresh = await service.getHealthState();
  observedAt = startedAt + 46 * 1000;
  const stale = await service.getHealthState();
  observedAt = startedAt + 5 * 60 * 1000 + 1;
  const unavailable = await service.getHealthState();

  assert.equal(fresh.freshness.status, 'fresh');
  assert.equal(stale.freshness.status, 'stale');
  assert.equal(stale.stale, true);
  assert.equal(unavailable.freshness.status, 'unavailable');
  assert.equal(unavailable.available, false);
  assert.equal(unavailable.generationId, 'health-generation');
  assert.equal(
    unavailable.lastSuccessfulRefreshAt,
    '2026-07-26T16:00:00.000Z'
  );
});

test('two Redis-backed runtime instances observe the same durable generation', async () => {
  const redis = new Map();
  const redisFetch = async (url, options) => {
    const command = JSON.parse(options.body);
    let result = null;
    if (command[0] === 'GET') {
      result = redis.get(command[1]) ?? null;
    } else if (command[0] === 'SET') {
      const key = command[1];
      if (command.includes('NX') && redis.has(key)) {
        result = null;
      } else {
        redis.set(key, command[2]);
        result = 'OK';
      }
    } else if (command[0] === 'EVAL') {
      if (command[2] === 2) {
        redis.set(command[3], command[5]);
        if (command[6] && redis.get(command[4]) === command[6]) {
          redis.delete(command[4]);
        }
        result = 1;
      } else {
        const key = command[3];
        if (redis.get(key) === command[4]) {
          redis.delete(key);
          result = 1;
        } else {
          result = 0;
        }
      }
    }
    return { ok: true, json: async () => ({ result }) };
  };
  const storeOptions = {
    url: 'https://fixture.upstash.io',
    token: 'fixture-token',
    fetchImpl: redisFetch
  };
  let loads = 0;
  const first = createCatalogService({
    store: createRedisCatalogStore(storeOptions),
    createId: () => 'redis-generation',
    loadCatalog: async (request, options) => {
      loads += 1;
      return {
        ...fixtureEnvelope(),
        generatedAt: options.generatedAt,
        generationId: options.generationId
      };
    }
  });
  const second = createCatalogService({
    store: createRedisCatalogStore(storeOptions),
    createId: () => 'redis-second-request',
    loadCatalog: async () => {
      throw new Error('second runtime must not reload Shopify');
    }
  });

  const generated = await first.getCatalog({ headers: {} });
  const shared = await second.getCatalog({ headers: {} });

  assert.equal(loads, 1);
  assert.equal(shared.generationId, generated.generationId);
  assert.equal(shared.lastSuccessfulRefreshAt, generated.lastSuccessfulRefreshAt);
  assert.equal(shared.cache, 'hit');
});
