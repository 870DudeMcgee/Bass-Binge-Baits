'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const browserCatalog = require('../assets/js/catalog.js');

test('the browser catalog has no local products before a validated envelope arrives', () => {
  assert.deepEqual(browserCatalog.listProducts(), []);
  assert.equal(browserCatalog.status.source, 'unavailable');
});

test('the browser collection replaces fallback cards with the admitted live projection', () => {
  const admittedCard = {
    key: 'admitted-jig',
    handle: 'admitted-jig',
    pagePath: 'products/admitted-jig',
    title: 'Admitted Jig',
    shortTitle: 'Admitted Jig',
    search: 'Admitted Jig',
    basePrice: 5,
    baseMoney: { amount: '5.00', currencyCode: 'USD' },
    featuredImage: null,
    featuredImageAlt: 'Admitted Jig',
    defaultColorKey: null,
    defaultWeightKey: null,
    detailOnly: true,
    rattle: { available: false, defaultKey: 'no', options: [] },
    weights: [],
    colors: [],
    variants: []
  };

  const applied = browserCatalog.applyRemoteCatalog({
    schemaVersion: 2,
    generationId: 'generation-admitted',
    products: [{
      handle: admittedCard.handle,
      presentation: { kind: 'ordinary' }
    }],
    legacy: {
      ok: true,
      source: 'shopify',
      fetchedAt: '2026-07-26T15:00:00.000Z',
      products: [admittedCard],
      currentDrop: null,
      rattle: null,
      errors: []
    }
  });

  assert.equal(applied, true);
  assert.deepEqual(
    browserCatalog.listProducts().map((product) => product.handle),
    ['admitted-jig']
  );
});

test('an invalid or unavailable response clears the last browser projection', () => {
  const applied = browserCatalog.applyRemoteCatalog({
    schemaVersion: 2,
    generationId: null,
    products: [],
    legacy: {
      ok: true,
      products: [{
        handle: 'local-resurrection',
        pagePath: 'products/local-resurrection'
      }]
    }
  });

  assert.equal(applied, false);
  assert.deepEqual(browserCatalog.listProducts(), []);
  assert.equal(browserCatalog.status.source, 'unavailable');
});

test('a legacy projection cannot resurrect a product absent from the admitted envelope', () => {
  const applied = browserCatalog.applyRemoteCatalog({
    schemaVersion: 2,
    generationId: 'generation-deleted',
    products: [],
    legacy: {
      ok: true,
      source: 'shopify',
      products: [{
        key: 'deleted-jig',
        handle: 'deleted-jig',
        pagePath: 'products/deleted-jig'
      }]
    }
  });

  assert.equal(applied, true);
  assert.deepEqual(browserCatalog.listProducts(), []);
});
