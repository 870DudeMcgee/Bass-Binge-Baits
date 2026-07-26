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
const {
  createCatalogRuntime,
  deriveCatalogNamespace
} = require('../lib/shopify-catalog.js');

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

function createSerializedRedisFixtureStore(options = {}) {
  const values = new Map();
  const now = options.now || Date.now;

  function liveValue(key) {
    const entry = values.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= now()) {
      values.delete(key);
      return null;
    }
    return entry ? entry.value : null;
  }

  const fetchImpl = async (url, requestOptions) => {
    const command = JSON.parse(requestOptions.body);
    let result = null;
    if (command[0] === 'GET') {
      result = liveValue(command[1]);
    } else if (command[0] === 'PTTL') {
      const entry = values.get(command[1]);
      result = entry && liveValue(command[1]) !== null && entry.expiresAt !== null
        ? Math.max(0, entry.expiresAt - now())
        : -1;
    } else if (command[0] === 'DEL') {
      result = values.delete(command[1]) ? 1 : 0;
    } else if (command[0] === 'SET') {
      const key = command[1];
      if (command.includes('NX') && liveValue(key) !== null) {
        result = null;
      } else {
        const pxIndex = command.indexOf('PX');
        values.set(key, {
          value: command[2],
          expiresAt: pxIndex === -1 ? null : now() + Number(command[pxIndex + 1])
        });
        result = 'OK';
      }
    } else if (command[0] === 'EVAL' && command[2] === 1) {
      if (liveValue(command[3]) === command[4]) {
        if (command[1].includes('PEXPIRE')) {
          values.get(command[3]).expiresAt = now() + Number(command[5]);
        } else {
          values.delete(command[3]);
        }
        result = 1;
      } else {
        result = 0;
      }
    } else if (command[0] === 'EVAL' && command[2] === 3) {
      const [webhookKey, dirtyKey, scheduleKey] = command.slice(3, 6);
      const [acceptedRaw, dedupeMs, dirtyRaw, scheduleToken, scheduleTtlMs] =
        command.slice(6);
      if (liveValue(webhookKey) !== null) {
        result = [0, 0];
      } else {
        values.set(webhookKey, {
          value: acceptedRaw,
          expiresAt: now() + Number(dedupeMs)
        });
        values.set(dirtyKey, { value: dirtyRaw, expiresAt: null });
        let scheduled = 0;
        if (liveValue(scheduleKey) === null) {
          values.set(scheduleKey, {
            value: scheduleToken,
            expiresAt: now() + Number(scheduleTtlMs)
          });
          scheduled = 1;
        }
        result = [1, scheduled];
      }
    } else if (command[0] === 'EVAL' && command[2] === 4) {
      const [recordKey, dirtyKey, leaseKey, scheduleKey] = command.slice(3, 7);
      const [
        recordRaw,
        capturedDirtyRaw,
        leaseToken,
        scheduleToken,
        followUpScheduleToken,
        scheduleTtlMs
      ] = command.slice(7);
      if (liveValue(leaseKey) !== leaseToken) {
        result = [0, 0];
      } else {
        values.set(recordKey, { value: recordRaw, expiresAt: null });
        if (capturedDirtyRaw && liveValue(dirtyKey) === capturedDirtyRaw) {
          values.delete(dirtyKey);
        }
        let scheduled = 0;
        if (scheduleToken && liveValue(scheduleKey) === scheduleToken) {
          values.delete(scheduleKey);
          if (liveValue(dirtyKey) !== null) {
            values.set(scheduleKey, {
              value: followUpScheduleToken,
              expiresAt: now() + Number(scheduleTtlMs)
            });
            scheduled = 1;
          }
        }
        result = [1, scheduled];
      }
    }
    return { ok: true, json: async () => ({ result }) };
  };

  return createRedisCatalogStore({
    url: 'https://fixture.upstash.io',
    token: 'fixture-token',
    fetchImpl
  });
}

test('catalog service rejects a durable store without fenced refresh commits', () => {
  assert.throws(
    () => createCatalogService({
      store: {
        async get() { return null; },
        async set() { return true; }
      },
      loadCatalog: async () => fixtureEnvelope()
    }),
    /fenced commitRefresh/
  );
});

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

test('runtime trust identities isolate every durable catalog transition', async () => {
  const store = createMemoryCatalogStore();
  const identities = [
    {
      name: 'production-shop-a',
      environment: {
        SHOPIFY_STORE_DOMAIN: 'shop-a.myshopify.com',
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'store.example.com'
      }
    },
    {
      name: 'preview-one-shop-a',
      environment: {
        SHOPIFY_STORE_DOMAIN: 'shop-a.myshopify.com',
        VERCEL_ENV: 'preview',
        VERCEL_DEPLOYMENT_ID: 'dpl_preview_one'
      }
    },
    {
      name: 'preview-two-shop-a',
      environment: {
        SHOPIFY_STORE_DOMAIN: 'shop-a.myshopify.com',
        VERCEL_ENV: 'preview',
        VERCEL_DEPLOYMENT_ID: 'dpl_preview_two'
      }
    },
    {
      name: 'production-shop-b',
      environment: {
        SHOPIFY_STORE_DOMAIN: 'shop-b.myshopify.com',
        VERCEL_ENV: 'production',
        VERCEL_PROJECT_PRODUCTION_URL: 'store.example.com'
      }
    }
  ];
  const runtimes = new Map(identities.map(({ name, environment }) => [
    name,
    createCatalogRuntime({
      environment,
      store,
      createId: (() => {
        let id = 0;
        return () => `${name}-${++id}`;
      })(),
      loadCatalog: async (request, options) => ({
        ...fixtureEnvelope(),
        generatedAt: options.generatedAt,
        generationId: `${name}-generation`
      })
    })
  ]));

  for (const { name } of identities) {
    const catalog = await runtimes.get(name).getCatalog({ headers: {} });
    assert.equal(catalog.generationId, `${name}-generation`);
  }

  const production = runtimes.get('production-shop-a');
  const firstInvalidation = await production.acceptInvalidation({
    webhookId: 'shared-webhook-id',
    topic: 'products/update'
  });
  assert.equal(firstInvalidation.duplicate, false);
  assert.equal((await production.getHealthState()).dirty, true);
  for (const name of [
    'preview-one-shop-a',
    'preview-two-shop-a',
    'production-shop-b'
  ]) {
    const runtime = runtimes.get(name);
    assert.equal((await runtime.getHealthState()).dirty, false, name);
    assert.equal((await runtime.acceptInvalidation({
      webhookId: 'shared-webhook-id',
      topic: 'products/update'
    })).duplicate, false, name);
  }

  await runtimes.get('preview-one-shop-a').reconcile({ headers: {} });
  assert.equal(
    (await production.getHealthState()).generationId,
    'production-shop-a-generation'
  );
});

test('runtime namespaces reject ambiguous trust identities and aliasing overrides', () => {
  const baseEnvironment = {
    SHOPIFY_STORE_DOMAIN: 'shop-a.myshopify.com',
    VERCEL_ENV: 'preview'
  };

  assert.throws(
    () => createCatalogRuntime({
      environment: baseEnvironment,
      store: createMemoryCatalogStore(),
      loadCatalog: async () => fixtureEnvelope()
    }),
    (error) => error.code === 'catalog_namespace_invalid'
  );
  assert.throws(
    () => createCatalogRuntime({
      environment: {
        ...baseEnvironment,
        VERCEL_DEPLOYMENT_ID: 'dpl_preview_one',
        CATALOG_CACHE_NAMESPACE: 'shared-preview'
      },
      store: createMemoryCatalogStore(),
      loadCatalog: async () => fixtureEnvelope()
    }),
    (error) => error.code === 'catalog_namespace_invalid'
  );
  const firstPreviewNamespace = deriveCatalogNamespace({
    ...baseEnvironment,
    VERCEL_DEPLOYMENT_ID: 'dpl_preview_one'
  });
  assert.throws(
    () => createCatalogRuntime({
      environment: {
        ...baseEnvironment,
        VERCEL_DEPLOYMENT_ID: 'dpl_preview_two',
        CATALOG_CACHE_NAMESPACE: firstPreviewNamespace
      },
      store: createMemoryCatalogStore(),
      loadCatalog: async () => fixtureEnvelope()
    }),
    (error) => error.code === 'catalog_namespace_invalid'
  );
  assert.throws(
    () => createCatalogRuntime({
      environment: {
        SHOPIFY_STORE_DOMAIN: 'https://shop-a.myshopify.com',
        VERCEL_ENV: 'production'
      },
      store: createMemoryCatalogStore(),
      loadCatalog: async () => fixtureEnvelope()
    }),
    (error) => error.code === 'catalog_namespace_invalid'
  );
  assert.notEqual(
    deriveCatalogNamespace({
      ...baseEnvironment,
      VERCEL_DEPLOYMENT_ID: 'dpl_Preview'
    }),
    deriveCatalogNamespace({
      ...baseEnvironment,
      VERCEL_DEPLOYMENT_ID: 'dpl_preview'
    })
  );
});

test('a refresh lease in one trust identity does not block another identity', async () => {
  const store = createMemoryCatalogStore();
  let releaseProduction;
  const productionBlocked = new Promise((resolve) => {
    releaseProduction = resolve;
  });
  let productionStarted;
  const productionLoading = new Promise((resolve) => {
    productionStarted = resolve;
  });
  const production = createCatalogRuntime({
    environment: {
      SHOPIFY_STORE_DOMAIN: 'shop-a.myshopify.com',
      VERCEL_ENV: 'production',
      VERCEL_PROJECT_PRODUCTION_URL: 'store.example.com'
    },
    store,
    loadCatalog: async (request, options) => {
      productionStarted();
      await productionBlocked;
      return {
        ...fixtureEnvelope(),
        generatedAt: options.generatedAt,
        generationId: 'production-generation'
      };
    }
  });
  const preview = createCatalogRuntime({
    environment: {
      SHOPIFY_STORE_DOMAIN: 'shop-a.myshopify.com',
      VERCEL_ENV: 'preview',
      VERCEL_DEPLOYMENT_ID: 'dpl_preview'
    },
    store,
    loadCatalog: async (request, options) => ({
      ...fixtureEnvelope(),
      generatedAt: options.generatedAt,
      generationId: 'preview-generation'
    })
  });

  const pendingProduction = production.getCatalog({ headers: {} });
  await productionLoading;
  assert.equal(
    (await preview.getCatalog({ headers: {} })).generationId,
    'preview-generation'
  );
  releaseProduction();
  assert.equal(
    (await pendingProduction).generationId,
    'production-generation'
  );
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

test('only one canonical Shopify HMAC header reaches invalidation', async () => {
  const secret = 'canonical-webhook-secret';
  const rawBody = Buffer.from('{"id":123}');
  const canonical = createHmac('sha256', secret).update(rawBody).digest('base64');
  const invalidSignatures = [
    undefined,
    createHmac('sha256', 'wrong-secret').update(rawBody).digest('base64'),
    [canonical, canonical],
    `${canonical},${canonical}`,
    `${canonical.slice(1)}${canonical[0]}`,
    `${canonical}junk`,
    `${canonical.slice(0, -1)}==`,
    canonical.slice(0, -1),
    ` ${canonical}`
  ];

  for (const provided of invalidSignatures) {
    let invalidations = 0;
    const handler = createCatalogWebhookHandler({
      getSecret: () => secret,
      acceptInvalidation: async () => {
        invalidations += 1;
        return { duplicate: false, scheduled: false };
      },
      runScheduledRefresh: async () => {},
      defer() {}
    });
    const response = responseRecorder();
    const headers = {
      'x-shopify-webhook-id': 'canonical-matrix',
      'x-shopify-topic': 'products/update',
      'x-shopify-shop-domain': 'bassbingebaits.myshopify.com'
    };
    if (provided !== undefined) headers['x-shopify-hmac-sha256'] = provided;

    await handler({ method: 'POST', headers, rawBody }, response);

    assert.equal(response.statusCode, 401, JSON.stringify(provided));
    assert.equal(response.body.code, 'catalog_webhook_invalid_hmac');
    assert.equal(invalidations, 0);
  }
});

test('oversized Buffer, string, and stream webhook bodies fail before invalidation', async () => {
  const oversizedBuffer = Buffer.alloc(1024 * 1024 + 1, 97);
  const bodies = [
    { rawBody: oversizedBuffer },
    { rawBody: oversizedBuffer.toString() },
    {
      async *[Symbol.asyncIterator]() {
        yield oversizedBuffer.subarray(0, 1024 * 1024);
        yield oversizedBuffer.subarray(1024 * 1024);
      }
    }
  ];

  for (const body of bodies) {
    let invalidations = 0;
    const handler = createCatalogWebhookHandler({
      getSecret: () => 'body-limit-secret',
      acceptInvalidation: async () => {
        invalidations += 1;
        return { duplicate: false, scheduled: false };
      },
      runScheduledRefresh: async () => {},
      defer() {}
    });
    const response = responseRecorder();
    const request = {
      method: 'POST',
      headers: {
        'x-shopify-hmac-sha256': 'not-reached',
        'x-shopify-webhook-id': 'oversized-body',
        'x-shopify-topic': 'products/update',
        'x-shopify-shop-domain': 'bassbingebaits.myshopify.com'
      },
      ...body
    };

    await handler(request, response);

    assert.equal(response.statusCode, 400);
    assert.equal(response.body.code, 'catalog_webhook_raw_body_required');
    assert.equal(invalidations, 0);
  }
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

test('an expired refresh owner cannot overwrite the successor generation', async () => {
  let observedAt = Date.parse('2026-07-26T16:00:00.000Z');
  const store = createMemoryCatalogStore({ now: () => observedAt });
  let resumeFirstRefresh;
  const firstRefreshBlocked = new Promise((resolve) => {
    resumeFirstRefresh = resolve;
  });
  let firstRefreshStarted;
  const firstRefreshLoading = new Promise((resolve) => {
    firstRefreshStarted = resolve;
  });
  const first = createCatalogService({
    store,
    now: () => observedAt,
    leaseMs: 100,
    createId: (() => {
      let id = 0;
      return () => `first-${++id}`;
    })(),
    loadCatalog: async (request, options) => {
      firstRefreshStarted();
      await firstRefreshBlocked;
      return {
        ...fixtureEnvelope(),
        generatedAt: options.generatedAt,
        generationId: 'generation-a'
      };
    }
  });
  const second = createCatalogService({
    store,
    now: () => observedAt,
    leaseMs: 100,
    createId: (() => {
      let id = 0;
      return () => `second-${++id}`;
    })(),
    loadCatalog: async (request, options) => ({
      ...fixtureEnvelope(),
      generatedAt: options.generatedAt,
      generationId: 'generation-b'
    })
  });

  const staleRefresh = first.reconcile({ headers: {} });
  await firstRefreshLoading;
  observedAt += 101;
  await second.reconcile({ headers: {} });
  resumeFirstRefresh();

  await assert.rejects(
    staleRefresh,
    (error) => error.code === 'shopify_catalog_unavailable' &&
      error.details.reason === 'refresh_lease_lost'
  );
  const durableRecord = await store.get('bass-binge:catalog:v2:envelope');
  assert.equal(durableRecord.envelope.generationId, 'generation-b');
});

test('a newer dirty token owns exactly one follow-up scheduled refresh', async () => {
  let observedAt = Date.parse('2026-07-26T16:00:00.000Z');
  let loads = 0;
  let nextId = 0;
  let service;
  const store = createMemoryCatalogStore({ now: () => observedAt });
  service = createCatalogService({
    store,
    now: () => observedAt,
    debounceMs: 25,
    delay: async (delayMs) => {
      observedAt += delayMs;
    },
    createId: () => `follow-up-${++nextId}`,
    loadCatalog: async (request, options) => {
      loads += 1;
      if (loads === 2) {
        const secondEvent = await service.acceptInvalidation({
          webhookId: 'webhook-d2',
          topic: 'products/update'
        });
        assert.equal(secondEvent.scheduled, false);
      }
      return {
        ...fixtureEnvelope(),
        generatedAt: options.generatedAt,
        generationId: `generation-${loads}`
      };
    }
  });

  await service.getCatalog({ headers: {} });
  const firstEvent = await service.acceptInvalidation({
    webhookId: 'webhook-d1',
    topic: 'products/update'
  });
  observedAt += 25;

  const refreshed = await service.runScheduledRefresh(
    { headers: {} },
    firstEvent.scheduleToken
  );

  assert.equal(loads, 3);
  assert.equal(refreshed.generationId, 'generation-3');
  assert.equal(
    await store.get('bass-binge:catalog:v2:dirty'),
    null
  );
  assert.equal(
    await store.get('bass-binge:catalog:v2:refresh-schedule'),
    null
  );
});

test('a scheduled refresh retries after colliding with another lease owner', async () => {
  let observedAt = Date.parse('2026-07-26T16:00:00.000Z');
  let loads = 0;
  const delays = [];
  const store = createMemoryCatalogStore({ now: () => observedAt });
  const service = createCatalogService({
    store,
    now: () => observedAt,
    debounceMs: 25,
    scheduledRetryMs: 10,
    maxScheduledRefreshAttempts: 2,
    delay: async (delayMs) => {
      delays.push(delayMs);
      observedAt += delayMs;
    },
    createId: (() => {
      let id = 0;
      return () => `collision-${++id}`;
    })(),
    loadCatalog: async (request, options) => {
      loads += 1;
      return {
        ...fixtureEnvelope(),
        generatedAt: options.generatedAt,
        generationId: `generation-${loads}`
      };
    }
  });

  await service.getCatalog({ headers: {} });
  const event = await service.acceptInvalidation({
    webhookId: 'webhook-collision',
    topic: 'products/update'
  });
  observedAt += 25;
  await store.set(
    'bass-binge:catalog:v2:refresh-lease',
    'another-owner',
    { nx: true, ttlMs: 10 }
  );

  const refreshed = await service.runScheduledRefresh(
    { headers: {} },
    event.scheduleToken
  );

  assert.equal(refreshed.generationId, 'generation-2');
  assert.equal(loads, 2);
  assert.deepEqual(delays, [10]);
  assert.equal(await store.get('bass-binge:catalog:v2:dirty'), null);
});

test('collision retry preserves schedule ownership when the retry also fails', async () => {
  let observedAt = Date.parse('2026-07-26T16:00:00.000Z');
  let upstreamAvailable = true;
  const store = createMemoryCatalogStore({ now: () => observedAt });
  const service = createCatalogService({
    store,
    now: () => observedAt,
    debounceMs: 25,
    leaseMs: 10,
    maxScheduledRefreshAttempts: 2,
    delay: async (delayMs) => {
      observedAt += delayMs;
    },
    createId: (() => {
      let id = 0;
      return () => `collision-failure-${++id}`;
    })(),
    loadCatalog: async (request, options) => {
      if (!upstreamAvailable) {
        observedAt += 50;
        throw new Error('fixture retry failure');
      }
      return {
        ...fixtureEnvelope(),
        generatedAt: options.generatedAt,
        generationId: 'generation-stable'
      };
    }
  });

  await service.getCatalog({ headers: {} });
  const event = await service.acceptInvalidation({
    webhookId: 'webhook-collision-failure',
    topic: 'products/update'
  });
  observedAt += 25;
  await store.set(
    'bass-binge:catalog:v2:refresh-lease',
    'another-owner',
    { nx: true, ttlMs: 10 }
  );
  upstreamAvailable = false;

  await assert.rejects(
    service.runScheduledRefresh({ headers: {} }, event.scheduleToken),
    /fixture retry failure/
  );
  assert.notEqual(await store.get('bass-binge:catalog:v2:dirty'), null);
  assert.equal(
    await store.get('bass-binge:catalog:v2:refresh-schedule'),
    event.scheduleToken
  );
  assert.ok(
    await store.ttl('bass-binge:catalog:v2:refresh-schedule') > 0
  );
});

test('a failed deferred refresh preserves durable ownership for recovery', async () => {
  let observedAt = Date.parse('2026-07-26T16:00:00.000Z');
  let upstreamAvailable = true;
  let loads = 0;
  const store = createMemoryCatalogStore({ now: () => observedAt });
  const service = createCatalogService({
    store,
    now: () => observedAt,
    debounceMs: 25,
    maxScheduledRefreshAttempts: 1,
    createId: (() => {
      let id = 0;
      return () => `recovery-${++id}`;
    })(),
    loadCatalog: async (request, options) => {
      if (!upstreamAvailable) throw new Error('fixture deferred failure');
      loads += 1;
      return {
        ...fixtureEnvelope(),
        generatedAt: options.generatedAt,
        generationId: `generation-${loads}`
      };
    }
  });

  await service.getCatalog({ headers: {} });
  const event = await service.acceptInvalidation({
    webhookId: 'webhook-recoverable',
    topic: 'products/update'
  });
  observedAt += 25;
  upstreamAvailable = false;

  await assert.rejects(
    service.runScheduledRefresh({ headers: {} }, event.scheduleToken),
    /fixture deferred failure/
  );
  assert.notEqual(await store.get('bass-binge:catalog:v2:dirty'), null);
  assert.equal(
    await store.get('bass-binge:catalog:v2:refresh-schedule'),
    event.scheduleToken
  );

  upstreamAvailable = true;
  const recovered = await service.runScheduledRefresh(
    { headers: {} },
    event.scheduleToken
  );
  assert.equal(recovered.generationId, 'generation-2');
  assert.equal(await store.get('bass-binge:catalog:v2:dirty'), null);
  assert.equal(await store.get('bass-binge:catalog:v2:refresh-schedule'), null);
});

test('the serialized Redis transition fences owners and transfers newer dirty work', async () => {
  let observedAt = 0;
  const store = createSerializedRedisFixtureStore({ now: () => observedAt });
  const commit = (input) => store.commitRefresh({
    recordKey: 'catalog',
    dirtyKey: 'dirty',
    leaseKey: 'lease',
    scheduleKey: 'schedule',
    scheduleTtlMs: 500,
    ...input
  });

  await store.set('lease', 'owner-a', { nx: true, ttlMs: 100 });
  await store.set('dirty', 'dirty-1');
  await store.set('schedule', 'schedule-1', { nx: true, ttlMs: 500 });
  observedAt = 101;
  await store.set('lease', 'owner-b', { nx: true, ttlMs: 100 });
  const successor = await commit({
    record: { generationId: 'generation-b' },
    dirtyRaw: 'dirty-1',
    leaseToken: 'owner-b',
    scheduleToken: 'schedule-1',
    followUpScheduleToken: 'schedule-2'
  });
  const staleOwner = await commit({
    record: { generationId: 'generation-a' },
    dirtyRaw: 'dirty-1',
    leaseToken: 'owner-a',
    scheduleToken: 'schedule-1',
    followUpScheduleToken: 'schedule-stale'
  });

  assert.deepEqual(successor, {
    committed: true,
    scheduled: false,
    scheduleToken: null
  });
  assert.deepEqual(staleOwner, {
    committed: false,
    scheduled: false,
    scheduleToken: null
  });
  assert.deepEqual(await store.get('catalog'), {
    generationId: 'generation-b'
  });

  await store.deleteIfValue('lease', 'owner-b');
  await store.set('lease', 'owner-c', { nx: true, ttlMs: 100 });
  await store.set('dirty', 'dirty-1');
  await store.set('schedule', 'schedule-1', { nx: true, ttlMs: 500 });
  await store.set('dirty', 'dirty-2');
  const handedOff = await commit({
    record: { generationId: 'generation-c' },
    dirtyRaw: 'dirty-1',
    leaseToken: 'owner-c',
    scheduleToken: 'schedule-1',
    followUpScheduleToken: 'schedule-2'
  });

  assert.deepEqual(handedOff, {
    committed: true,
    scheduled: true,
    scheduleToken: 'schedule-2'
  });
  assert.equal(await store.get('dirty'), 'dirty-2');
  assert.equal(await store.get('schedule'), 'schedule-2');

  await store.deleteIfValue('lease', 'owner-c');
  await store.set('lease', 'owner-d', { nx: true, ttlMs: 100 });
  const completed = await commit({
    record: { generationId: 'generation-d' },
    dirtyRaw: 'dirty-2',
    leaseToken: 'owner-d',
    scheduleToken: 'schedule-2',
    followUpScheduleToken: 'schedule-3'
  });
  assert.deepEqual(completed, {
    committed: true,
    scheduled: false,
    scheduleToken: null
  });
  assert.equal(await store.get('dirty'), null);
  assert.equal(await store.get('schedule'), null);
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
      const result = command[2] === 4 ? [1, 1] : 1;
      return { ok: true, json: async () => ({ result }) };
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
  assert.deepEqual(await store.commitRefresh({
    recordKey: 'catalog',
    record: { generationId: 'next' },
    dirtyKey: 'dirty',
    dirtyRaw: '{"token":"dirty-1"}',
    leaseKey: 'lease',
    leaseToken: 'fixture-lease',
    scheduleKey: 'schedule',
    scheduleToken: 'fixture-schedule',
    followUpScheduleToken: 'fixture-follow-up',
    scheduleTtlMs: 60000
  }), {
    committed: true,
    scheduled: true,
    scheduleToken: 'fixture-follow-up'
  });
  assert.equal(
    await store.extendIfValue('schedule', 'fixture-follow-up', 60000),
    true
  );
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
  assert.equal(commands[3][2], 4);
  assert.equal(commands[3][3], 'catalog');
  assert.equal(commands[3][4], 'dirty');
  assert.equal(commands[3][5], 'lease');
  assert.equal(commands[3][6], 'schedule');
  assert.match(commands[3][1], /GET", KEYS\[3\]/);
  assert.match(commands[3][1], /GET", KEYS\[4\]/);
  assert.match(commands[3][1], /EXISTS", KEYS\[2\]/);
  assert.deepEqual(commands[3].slice(9), [
    '"fixture-lease"',
    '"fixture-schedule"',
    '"fixture-follow-up"',
    60000
  ]);
  assert.equal(commands[4][0], 'EVAL');
  assert.equal(commands[4][2], 1);
  assert.equal(commands[4][3], 'schedule');
  assert.equal(commands[4][4], '"fixture-follow-up"');
  assert.equal(commands[4][5], 60000);
  assert.match(commands[4][1], /PEXPIRE/);
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
      if (command[2] === 4) {
        if (redis.get(command[5]) !== command[9]) {
          result = [0, 0];
        } else {
          redis.set(command[3], command[7]);
          if (command[8] && redis.get(command[4]) === command[8]) {
            redis.delete(command[4]);
          }
          let scheduled = 0;
          if (command[10] && redis.get(command[6]) === command[10]) {
            redis.delete(command[6]);
            if (redis.has(command[4])) {
              redis.set(command[6], command[11]);
              scheduled = 1;
            }
          }
          result = [1, scheduled];
        }
      } else if (command[2] === 2) {
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
