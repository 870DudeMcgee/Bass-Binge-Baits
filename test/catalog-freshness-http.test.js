'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createCatalogHealthHandler } = require('../lib/catalog-health.js');
const { CatalogUnavailableError } = require('../lib/catalog-freshness.js');
const { createCatalogHandler } = require('../api/catalog.js');
const { createCatalogReconcileHandler } = require('../api/catalog-reconcile.js');

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

test('catalog HTTP returns an explicit unavailable response after stale expiry', async () => {
  const handler = createCatalogHandler({
    getCatalog: async () => {
      throw new CatalogUnavailableError('fixture unavailable', {
        reason: 'stale_window_expired'
      });
    }
  });
  const response = responseRecorder();

  await handler({ method: 'GET', headers: {} }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(response.body, {
    ok: false,
    code: 'shopify_catalog_unavailable',
    message: 'The live catalog is temporarily unavailable.'
  });
});

test('protected health HTTP exposes unavailable durable metadata without secrets', async () => {
  const secret = 'health-secret';
  const handler = createCatalogHealthHandler({
    getToken: () => secret,
    getCatalogState: async () => ({
      schemaVersion: 2,
      available: false,
      generationId: 'generation-expired',
      generatedAt: '2026-07-26T16:00:00.000Z',
      sourceUpdatedAt: '2026-07-26T15:59:00.000Z',
      lastSuccessfulRefreshAt: '2026-07-26T16:00:00.000Z',
      dirty: true,
      dirtyAt: '2026-07-26T16:04:59.000Z',
      refreshDueAt: '2026-07-26T16:04:59.250Z',
      stale: false,
      freshness: {
        status: 'unavailable',
        ageSeconds: 301,
        ttlSeconds: 45,
        staleWindowSeconds: 300
      },
      products: [],
      outcomes: {
        accepted: [],
        warning: [],
        variantBlocked: [],
        productQuarantined: []
      }
    })
  });
  const response = responseRecorder();

  await handler({
    method: 'GET',
    headers: { authorization: `Bearer ${secret}` }
  }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.available, false);
  assert.equal(response.body.generationId, 'generation-expired');
  assert.equal(response.body.freshness.status, 'unavailable');
  assert.equal(response.body.lastSuccessfulRefreshAt, '2026-07-26T16:00:00.000Z');
  assert.equal(JSON.stringify(response.body).includes(secret), false);
});

test('periodic reconciliation HTTP is bearer-protected and returns only safe metadata', async () => {
  const secret = 'cron-secret';
  let reconciliations = 0;
  const handler = createCatalogReconcileHandler({
    getSecret: () => secret,
    reconcile: async () => {
      reconciliations += 1;
      return {
        generationId: 'generation-reconciled',
        generatedAt: '2026-07-26T16:01:00.000Z',
        sourceUpdatedAt: '2026-07-26T16:00:59.000Z',
        lastSuccessfulRefreshAt: '2026-07-26T16:01:00.000Z'
      };
    }
  });
  const unauthorized = responseRecorder();
  await handler({ method: 'GET', headers: {} }, unauthorized);
  assert.equal(unauthorized.statusCode, 401);

  const authorized = responseRecorder();
  await handler({
    method: 'GET',
    headers: { authorization: `Bearer ${secret}` }
  }, authorized);

  assert.equal(authorized.statusCode, 200);
  assert.equal(reconciliations, 1);
  assert.equal(authorized.body.generationId, 'generation-reconciled');
  assert.equal(JSON.stringify(authorized.body).includes(secret), false);
});

test('Vercel schedules the protected full reconciliation endpoint every minute', () => {
  const config = JSON.parse(fs.readFileSync(
    path.join(__dirname, '..', 'vercel.json'),
    'utf8'
  ));
  assert.deepEqual(config.crons, [{
    path: '/api/catalog-reconcile',
    schedule: '* * * * *'
  }]);
});
