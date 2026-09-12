'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createCatalogService } = require('../lib/catalog-freshness.js');
const { createMemoryCatalogStore } = require('../lib/catalog-durable-store.js');
const { createGenericProductHandler } = require('../lib/generic-product-route.js');

const product = {
  handle: 'hooded-long-sleeve-tee', title: 'Hooded long-sleeve tee',
  variants: [{ id: 'gid://shopify/ProductVariant/51090769150119',
    selectedOptions: [{ name: 'Color', value: 'Charcoal-Black Triblend' }, { name: 'Size', value: 'XL' }],
    price: { amount: '28.00', currencyCode: 'USD' }, availableForSale: true }]
};
const envelope = { schemaVersion: 2, products: [product], quarantine: [] };
const recordKey = 'bass-binge:catalog:v2:envelope';
const leaseKey = 'bass-binge:catalog:v2:refresh-lease';

for (const expired of [false, true]) {
  test(`concurrent product readers share a committed refresh with ${expired ? 'expired' : 'empty'} cache`, async () => {
    let clock = Date.parse('2026-09-12T07:07:00Z');
    const store = createMemoryCatalogStore({ now: () => clock });
    if (expired) await store.set(recordKey, {
      envelope: { ...envelope, generationId: 'expired' },
      lastSuccessfulRefreshAt: new Date(clock - 300001).toISOString()
    });
    let release, started;
    const blocked = new Promise(resolve => { release = resolve; });
    const loading = new Promise(resolve => { started = resolve; });
    let loads = 0;
    const leader = createCatalogService({ store, now: () => clock,
      loadCatalog: async () => { loads++; started(); await blocked; return { ...envelope, generationId: 'new' }; }
    });
    const leading = leader.getCatalog({});
    await loading;
    const follower = createCatalogService({ store, now: () => clock,
      delay: async ms => { clock += ms; release(); await leading; },
      loadCatalog: async () => { throw new Error('follower must not fetch Shopify'); }
    });
    const handler = createGenericProductHandler({ getCatalog: request => follower.getCatalog(request) });
    const response = { headers: {}, setHeader(k,v) { this.headers[k] = v; },
      status(code) { this.statusCode = code; return this; }, send(body) { this.body = body; return this; } };
    await handler({ method: 'GET', query: { handle: product.handle, variant: '51090769150119' } }, response);
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /data-price-display>\$28\.00/);
    assert.match(response.body, /51090769150119/);
    assert.match(response.body, /https:\/\/schema.org\/InStock/);
    assert.equal(loads, 1);
    assert.equal((await store.get(recordKey)).envelope.generationId, 'new');
    assert.equal(await store.get(leaseKey), null);
  });
}

for (const leaderFails of [false, true]) {
  test(`a ${leaderFails ? 'failed' : 'hung'} owner keeps bounded unavailable behavior and expired data private`, async () => {
    let clock = 1000000;
    const store = createMemoryCatalogStore({ now: () => clock });
    await store.set(recordKey, { envelope, lastSuccessfulRefreshAt: new Date(clock - 300001).toISOString() });
    await store.set(leaseKey, 'other-owner', { nx: true, ttlMs: 60000 });
    let waits = 0;
    const service = createCatalogService({ store, now: () => clock,
      delay: async ms => { clock += ms; waits++; if (leaderFails) await store.deleteIfValue(leaseKey, 'other-owner'); },
      loadCatalog: async () => { throw new Error('must not take over the owner'); }
    });
    await assert.rejects(service.getCatalog({}), error => error.statusCode === 503 && error.details.reason === 'refresh_in_progress');
    assert.equal(clock, 1008000);
    assert.equal(waits, 32);
    assert.equal(await store.get(leaseKey), leaderFails ? null : 'other-owner');
    assert.equal((await store.get(recordKey)).lastSuccessfulRefreshAt, new Date(699999).toISOString());
  });
}

test('a failed refresh cannot extend stale eligibility past five minutes', async () => {
  let clock = 1000000;
  const store = createMemoryCatalogStore({ now: () => clock });
  await store.set(recordKey, { envelope, lastSuccessfulRefreshAt: new Date(clock - 299000).toISOString() });
  const service = createCatalogService({ store, now: () => clock,
    loadCatalog: async () => { clock += 2000; throw new Error('upstream failed'); }
  });
  await assert.rejects(service.getCatalog({}), error => error.statusCode === 503 && error.details.reason === 'stale_window_expired');
});

test('the follower deadline also bounds a stalled durable read', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const store = createMemoryCatalogStore();
  await store.set(leaseKey, 'other-owner', { nx: true, ttlMs: 60000 });
  const get = store.get.bind(store);
  let polling = false, readStarted;
  const reading = new Promise(resolve => { readStarted = resolve; });
  store.get = async key => {
    if (polling) { readStarted(); return new Promise(() => {}); }
    return get(key);
  };
  const service = createCatalogService({ store,
    delay: async () => { polling = true; },
    loadCatalog: async () => { throw new Error('must not steal lease'); }
  });
  const result = assert.rejects(service.getCatalog({}), error => error.statusCode === 503 && error.details.reason === 'refresh_in_progress');
  await reading;
  t.mock.timers.tick(8000);
  await result;
  assert.equal(await get(leaseKey), 'other-owner');
});
