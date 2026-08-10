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

test('legacy rattle payload hydrates the admitted product for generic rendering', () => {
  const applied = browserCatalog.applyRemoteCatalog({
    schemaVersion: 2,
    generationId: 'generation-admitted-rattle',
    products: [{
      handle: 'rattle-admitted',
      presentation: { kind: 'ordinary' },
      pagePath: 'products/rattle-admitted',
      title: 'Rattle Admitted Jig',
      variants: [{
        id: 'gid://shopify/ProductVariant/910',
        title: 'Rattle Admitted Jig - Single',
        selectedOptions: [{ name: 'Color', value: 'Black' }],
        price: { amount: '5.00', currencyCode: 'USD' },
        availableForSale: true,
        imageId: 'gid://shopify/Image/410'
      }],
      media: [{
        id: 'gid://shopify/MediaImage/410',
        type: 'image',
        alt: 'Rattle Admitted Jig',
        image: {
          url: 'https://cdn.shopify.com/rattle-admitted-jig.jpg',
          id: 'gid://shopify/Image/410'
        }
      }],
      weights: [{ key: 'none', label: '5/8 oz' }],
      colors: [{ key: 'black', name: 'Black', image: 'https://cdn.shopify.com/rattle-admitted-jig.jpg' }]
    }],
    legacy: {
      ok: true,
      source: 'shopify',
      fetchedAt: '2026-07-26T15:00:00.000Z',
      products: [{
        key: 'rattle-admitted',
        handle: 'rattle-admitted',
        rattle: {
          available: true,
          defaultKey: 'no',
          options: [{
            key: 'no',
            label: 'No',
            priceDelta: 0
          }]
        },
        pagePath: 'products/rattle-admitted'
      }],
      currentDrop: null,
      rattle: {
        available: true,
        price: 1,
        currencyCode: 'USD',
        merchandiseId: 'gid://shopify/ProductVariant/999',
        variantId: 999,
        quantityAvailable: 20
      },
      errors: []
    }
  });

  assert.equal(applied, true);
  const admitted = browserCatalog.getAdmittedProduct('rattle-admitted');
  const rattleOptions = browserCatalog.getRattleOptions(admitted);

  assert.equal(admitted.rattle.available, true);
  assert.equal(admitted.rattle.defaultKey, 'no');
  assert.equal(admitted.rattle.options.length, 2);
  assert.equal(admitted.rattle.options[1].key, 'yes');
  assert.deepEqual(admitted.rattle.options, [{
      key: 'no',
      label: 'No',
      priceDelta: 0
    }, {
      key: 'yes',
      label: 'Yes',
      priceDelta: 1
    }]);
  assert.equal(rattleOptions.length, 2);
  assert.equal(rattleOptions[1].key, 'yes');
  assert.equal(rattleOptions[1].priceDelta, 1);
});

test('the Heartlander drop appears exactly once in the shop and remains the homepage drop', () => {
  const heartlanderCard = {
    key: 'limited-drop-heartlander-peewee-football-hd',
    handle: 'heartlander-peewee-football-hd',
    pagePath: 'products/heartlander-peewee-football-hd',
    title: '5/8 oz PeeWee Football HD — Heartlander',
    shortTitle: '5/8 oz PeeWee Football HD — Heartlander',
    isLimitedDrop: true,
    shopVisible: true,
    variants: [{
      id: 'gid://shopify/ProductVariant/51000785633447',
      available: true
    }]
  };

  const applied = browserCatalog.applyRemoteCatalog({
    schemaVersion: 2,
    generationId: 'generation-heartlander',
    products: [{
      handle: heartlanderCard.handle,
      title: heartlanderCard.title,
      presentation: { kind: 'limited-drop' },
      variants: [{
        id: 'gid://shopify/ProductVariant/51000785633447',
        selectedOptions: [
          { name: 'Color', value: 'Heartlander' },
          { name: 'Weight', value: '5/8 oz' }
        ],
        price: { amount: '5.99', currencyCode: 'USD' },
        availableForSale: true
      }],
      media: []
    }],
    legacy: {
      ok: true,
      source: 'shopify',
      products: [],
      currentDrop: heartlanderCard,
      rattle: null,
      errors: []
    }
  });

  assert.equal(applied, true);
  assert.deepEqual(
    browserCatalog.listProducts().map((product) => product.handle),
    ['heartlander-peewee-football-hd']
  );
  assert.equal(browserCatalog.getCurrentDrop().handle, 'heartlander-peewee-football-hd');
  assert.equal(
    browserCatalog.getCurrentDrop().variants[0].id,
    'gid://shopify/ProductVariant/51000785633447'
  );
  assert.equal(
    browserCatalog.getAdmittedProduct('heartlander-peewee-football-hd').title,
    '5/8 oz PeeWee Football HD — Heartlander'
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

test('persisted exact variants reconcile to the current admitted generation and money', () => {
  browserCatalog.applyRemoteCatalog({
    schemaVersion: 2,
    generationId: 'generation-current',
    products: [{
      handle: 'exact-jig',
      title: 'Exact Jig',
      presentation: { kind: 'ordinary' },
      variants: [{
        id: 'gid://shopify/ProductVariant/901',
        selectedOptions: [{ name: 'Finish / Style', value: 'Café  ' }],
        price: { amount: '7.25', currencyCode: 'USD' },
        availableForSale: true,
        imageId: 'gid://shopify/Image/501'
      }],
      media: [{
        id: 'gid://shopify/MediaImage/401',
        type: 'image',
        alt: 'Exact jig',
        image: {
          id: 'gid://shopify/Image/501',
          url: 'https://cdn.shopify.com/exact-jig.jpg'
        }
      }]
    }],
    legacy: {
      ok: true,
      source: 'shopify',
      products: [{
        key: 'exact-jig',
        handle: 'exact-jig',
        pagePath: 'products/exact-jig'
      }],
      currentDrop: null,
      rattle: null,
      errors: []
    }
  });

  const result = browserCatalog.reconcileExactCartLine({
    kind: 'shopify-variant',
    id: 'gid://shopify/ProductVariant/901',
    productKey: 'exact-jig',
    productTitle: 'Old title',
    selectedOptions: [{ name: 'Finish / Style', value: 'Café  ' }],
    price: { amount: '7.25', currencyCode: 'USD' },
    checkoutMapping: {
      merchandiseId: 'gid://shopify/ProductVariant/901',
      price: { amount: '7.25', currencyCode: 'USD' }
    },
    quantity: 2,
    admittedGenerationId: 'generation-old'
  });

  assert.equal(result.reason, null);
  assert.equal(result.line.admittedGenerationId, 'generation-current');
  assert.equal(result.line.productTitle, 'Exact Jig');
  assert.equal(result.line.image, 'https://cdn.shopify.com/exact-jig.jpg');
  assert.deepEqual(result.line.selectedOptions, [
    { name: 'Finish / Style', value: 'Café  ' }
  ]);
});

test('persisted exact variants fail reconciliation after deletion, quarantine, sale, or money changes', () => {
  const original = {
    kind: 'shopify-variant',
    id: 'gid://shopify/ProductVariant/901',
    productKey: 'exact-jig',
    selectedOptions: [{ name: 'Finish / Style', value: 'Café  ' }],
    price: { amount: '7.25', currencyCode: 'USD' },
    checkoutMapping: {
      merchandiseId: 'gid://shopify/ProductVariant/901',
      price: { amount: '7.25', currencyCode: 'USD' }
    },
    quantity: 1,
    admittedGenerationId: 'generation-old'
  };

  const soldOutPayload = {
    schemaVersion: 2,
    generationId: 'generation-sold-out',
    products: [{
      handle: 'exact-jig',
      title: 'Exact Jig',
      presentation: { kind: 'ordinary' },
      variants: [{
        id: original.id,
        selectedOptions: original.selectedOptions,
        price: original.price,
        availableForSale: false,
        imageId: null
      }],
      media: []
    }],
    legacy: {
      ok: true,
      source: 'shopify',
      products: [{ key: 'exact-jig', handle: 'exact-jig', pagePath: 'products/exact-jig' }],
      currentDrop: null,
      rattle: null,
      errors: []
    }
  };

  browserCatalog.applyRemoteCatalog(soldOutPayload);
  assert.equal(browserCatalog.reconcileExactCartLine(original).reason, 'sold-out');

  assert.equal(browserCatalog.reconcileExactCartLine({
    ...original,
    id: 'gid://shopify/ProductVariant/999'
  }).reason, 'identity-changed');

  soldOutPayload.generationId = 'generation-repriced';
  soldOutPayload.products[0].variants[0].availableForSale = true;
  soldOutPayload.products[0].variants[0].price = { amount: '8.00', currencyCode: 'USD' };
  browserCatalog.applyRemoteCatalog(soldOutPayload);
  assert.equal(browserCatalog.reconcileExactCartLine(original).reason, 'price-changed');

  soldOutPayload.generationId = 'generation-currency';
  soldOutPayload.products[0].variants[0].price = { amount: '7.25', currencyCode: 'CAD' };
  browserCatalog.applyRemoteCatalog(soldOutPayload);
  assert.equal(browserCatalog.reconcileExactCartLine(original).reason, 'currency-changed');

  soldOutPayload.generationId = 'generation-options';
  soldOutPayload.products[0].variants[0].price = original.price;
  soldOutPayload.products[0].variants[0].selectedOptions = [{
    name: 'Finish / Style',
    value: 'Cafe'
  }];
  browserCatalog.applyRemoteCatalog(soldOutPayload);
  assert.equal(browserCatalog.reconcileExactCartLine(original).reason, 'options-changed');

  soldOutPayload.generationId = 'generation-quarantined';
  soldOutPayload.products = [];
  soldOutPayload.legacy.products = [];
  browserCatalog.applyRemoteCatalog(soldOutPayload);
  assert.equal(browserCatalog.reconcileExactCartLine(original).reason, 'not-admitted');
});
