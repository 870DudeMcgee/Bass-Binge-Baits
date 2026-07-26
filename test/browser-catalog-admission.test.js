'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const browserCatalog = require('../assets/js/catalog.js');

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
