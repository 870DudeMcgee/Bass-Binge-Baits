'use strict';

const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const http = require('node:http');
const test = require('node:test');

const { createCatalogHandler } = require('../api/catalog.js');
const { createCatalogHealthHandler } = require('../lib/catalog-health.js');
const { createMemoryCatalogStore } = require('../lib/catalog-durable-store.js');
const { createCatalogService } = require('../lib/catalog-freshness.js');
const { createCatalogWebhookHandler } = require('../lib/catalog-webhook.js');

function responseHelpers(response) {
  response.status = function status(code) {
    this.statusCode = code;
    return this;
  };
  response.json = function json(body) {
    this.setHeader('Content-Type', 'application/json');
    this.end(JSON.stringify(body));
    return this;
  };
  return response;
}

function fixtureEnvelope(options) {
  return {
    ok: true,
    source: 'shopify',
    schemaVersion: 2,
    generationId: options.generationId,
    generatedAt: options.generatedAt,
    sourceUpdatedAt: options.generatedAt,
    requestId: options.requestId,
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

test('network HTTP proves refresh, dedupe, unavailable, and protected health states', async (t) => {
  const startedAt = Date.parse('2026-07-26T16:00:00.000Z');
  let observedAt = startedAt;
  let upstreamAvailable = true;
  let nextId = 0;
  const service = createCatalogService({
    store: createMemoryCatalogStore(),
    now: () => observedAt,
    createId: () => `network-${++nextId}`,
    debounceMs: 1,
    loadCatalog: async (request, options) => {
      if (!upstreamAvailable) throw new Error('fixture upstream unavailable');
      return fixtureEnvelope(options);
    }
  });
  const deferred = [];
  const webhookSecret = 'network-webhook-secret';
  const healthSecret = 'network-health-secret';
  const catalogHandler = createCatalogHandler({
    getCatalog: (request) => service.getCatalog(request)
  });
  const webhookHandler = createCatalogWebhookHandler({
    getSecret: () => webhookSecret,
    acceptInvalidation: (event) => service.acceptInvalidation(event),
    runScheduledRefresh: (request, token) => service.runScheduledRefresh(request, token),
    defer(promise) {
      deferred.push(promise);
    },
    delay: async () => {},
    debounceMs: 1
  });
  const healthHandler = createCatalogHealthHandler({
    getToken: () => healthSecret,
    getCatalogState: () => service.getHealthState()
  });
  const server = http.createServer((request, response) => {
    responseHelpers(response);
    if (request.url === '/api/catalog') return catalogHandler(request, response);
    if (request.url === '/api/catalog-webhook') return webhookHandler(request, response);
    if (request.url === '/api/catalog-health') return healthHandler(request, response);
    response.statusCode = 404;
    response.end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const firstResponse = await fetch(`${baseUrl}/api/catalog`);
  const first = await firstResponse.json();
  assert.equal(firstResponse.status, 200);
  assert.equal(
    firstResponse.headers.get('cache-control'),
    'public, s-maxage=5, must-revalidate'
  );

  const rawBody = '{"id":123,"ignored":"payload facts"}';
  const signature = createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('base64');
  const webhookHeaders = {
    'Content-Type': 'application/json',
    'X-Shopify-Hmac-Sha256': signature,
    'X-Shopify-Webhook-Id': 'network-webhook-1',
    'X-Shopify-Topic': 'products/update',
    'X-Shopify-Shop-Domain': 'bassbingebaits.myshopify.com'
  };
  const acceptedResponse = await fetch(`${baseUrl}/api/catalog-webhook`, {
    method: 'POST',
    headers: webhookHeaders,
    body: rawBody
  });
  assert.equal(acceptedResponse.status, 202);
  assert.equal(deferred.length, 1);
  await deferred[0];

  const refreshed = await (await fetch(`${baseUrl}/api/catalog`)).json();
  assert.notEqual(refreshed.generationId, first.generationId);

  const duplicateResponse = await fetch(`${baseUrl}/api/catalog-webhook`, {
    method: 'POST',
    headers: webhookHeaders,
    body: rawBody
  });
  assert.equal(duplicateResponse.status, 200);
  assert.equal((await duplicateResponse.json()).duplicate, true);
  assert.equal(deferred.length, 1);

  const invalidResponse = await fetch(`${baseUrl}/api/catalog-webhook`, {
    method: 'POST',
    headers: {
      ...webhookHeaders,
      'X-Shopify-Webhook-Id': 'network-webhook-invalid',
      'X-Shopify-Hmac-Sha256': 'invalid'
    },
    body: rawBody
  });
  assert.equal(invalidResponse.status, 401);

  upstreamAvailable = false;
  observedAt += 5 * 60 * 1000 + 1;
  const unavailableResponse = await fetch(`${baseUrl}/api/catalog`);
  assert.equal(unavailableResponse.status, 503);
  assert.equal((await unavailableResponse.json()).code, 'shopify_catalog_unavailable');

  const healthResponse = await fetch(`${baseUrl}/api/catalog-health`, {
    headers: { Authorization: `Bearer ${healthSecret}` }
  });
  const health = await healthResponse.json();
  assert.equal(healthResponse.status, 503);
  assert.equal(health.freshness.status, 'unavailable');
  assert.equal(health.generationId, refreshed.generationId);
  assert.equal(JSON.stringify(health).includes(healthSecret), false);
});
