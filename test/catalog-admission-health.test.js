'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const fixtures = require('./fixtures/catalog-envelope-v2.json');
const { createCatalogHealthHandler } = require('../lib/catalog-health.js');
const { publicCatalogPayload } = require('../lib/catalog-public.js');
const { loadFreshCatalog } = require('../lib/shopify-catalog.js');

function fixtureProduct(overrides = {}) {
  return Object.assign(structuredClone(fixtures.colorOnly), overrides);
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

test('collection admission uses accepted v2 products without inventing option roles', async () => {
  const healthLogs = [];
  const admitted = fixtureProduct({
    id: 'gid://shopify/Product/701',
    handle: 'admitted-jig',
    title: 'Admitted Jig'
  });
  const warningOnly = fixtureProduct({
    id: 'gid://shopify/Product/702',
    handle: 'warning-jig',
    title: 'Warning Jig',
    featuredMedia: null,
    media: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }
  });
  const variantBlocked = fixtureProduct({
    id: 'gid://shopify/Product/703',
    handle: 'partially-valid-jig',
    title: 'Partially Valid Jig'
  });
  variantBlocked.variants.nodes[1].price = {
    amount: 'not-money',
    currencyCode: 'USD'
  };
  const productQuarantined = fixtureProduct({
    id: 'gid://shopify/Product/704',
    handle: 'blocked-jig',
    title: 'Blocked Jig'
  });
  productQuarantined.variants.nodes.forEach((variant) => {
    variant.price = { amount: 'not-money', currencyCode: 'USD' };
  });
  const hiddenAddOn = fixtureProduct({
    id: 'gid://shopify/Product/705',
    handle: 'rattle-add-on',
    title: 'Rattle Add-on',
    productType: 'Rattle Add-on',
    tags: ['rattle-add-on']
  });

  const envelope = await loadFreshCatalog({ headers: {} }, {
    authenticated: false,
    generatedAt: '2026-07-26T15:00:00.000Z',
    requestId: 'admission-fixture',
    logger: {
      warn(message, details) {
        healthLogs.push({ message, details });
      }
    },
    storefrontRequest: async () => ({
      products: {
        edges: [
          admitted,
          warningOnly,
          variantBlocked,
          productQuarantined,
          hiddenAddOn
        ].map((node, index) => ({ cursor: `product-${index + 1}`, node })),
        pageInfo: { hasNextPage: false, endCursor: 'product-5' }
      }
    })
  });

  assert.match(envelope.generationId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(
    envelope.legacy.products.map((product) => product.handle),
    ['admitted-jig', 'warning-jig', 'partially-valid-jig']
  );
  envelope.legacy.products.forEach((product) => {
    assert.equal(product.pagePath, `products/${product.handle}`);
    assert.equal(product.detailOnly, true);
    assert.deepEqual(product.colors, []);
    assert.deepEqual(product.weights, []);
    assert.equal(product.description, 'A color-only jig.');
  });
  assert.equal(
    envelope.outcomes.warning.some((issue) =>
      issue.handle === 'warning-jig' && issue.code === 'product_image_missing' && issue.remedy
    ),
    true
  );
  assert.equal(
    envelope.outcomes.variantBlocked.some((issue) =>
      issue.handle === 'partially-valid-jig' && issue.code === 'variant_money_invalid' && issue.remedy
    ),
    true
  );
  assert.equal(
    envelope.outcomes.productQuarantined.some((issue) =>
      issue.handle === 'blocked-jig' && issue.code === 'product_has_no_valid_variants' && issue.remedy
    ),
    true
  );
  assert.equal(healthLogs.length, 1);
  assert.equal(healthLogs[0].message, 'Shopify catalog admission issues');
  assert.equal(healthLogs[0].details.generationId, envelope.generationId);
  assert.deepEqual(
    healthLogs[0].details.issues['blocked-jig'],
    ['product_has_no_valid_variants', 'swatches_missing', 'variant_money_invalid']
  );
});

test('a blocked variant cannot re-enter the envelope-derived browser projection', async () => {
  const knownProduct = fixtureProduct({
    id: 'gid://shopify/Product/706',
    handle: '5-16-peewee-spider-hd-finesse-cut',
    title: '5/16 PeeWee Spider HD'
  });
  knownProduct.options[0].optionValues = [
    { id: 'gid://shopify/ProductOptionValue/711', name: 'Blackberry Smoothie' },
    { id: 'gid://shopify/ProductOptionValue/712', name: 'Ogre' }
  ];
  knownProduct.variants.nodes = [
    {
      ...knownProduct.variants.nodes[0],
      id: 'gid://shopify/ProductVariant/721',
      title: 'Blackberry Smoothie',
      selectedOptions: [{ name: 'Color', value: 'Blackberry Smoothie' }]
    },
    {
      ...knownProduct.variants.nodes[1],
      id: 'gid://shopify/ProductVariant/722',
      title: 'Ogre',
      selectedOptions: [{ name: 'Color', value: 'Ogre' }],
      price: { amount: 'not-money', currencyCode: 'USD' }
    }
  ];

  const envelope = await loadFreshCatalog({ headers: {} }, {
    authenticated: false,
    logger: { warn() {} },
    storefrontRequest: async () => ({
      products: {
        edges: [{ cursor: 'known-product', node: knownProduct }],
        pageInfo: { hasNextPage: false, endCursor: 'known-product' }
      }
    })
  });

  assert.deepEqual(
    envelope.legacy.products[0].variants.map((variant) => variant.id),
    ['gid://shopify/ProductVariant/721']
  );
  assert.deepEqual(
    envelope.legacy.products[0].colors.map((color) => ({
      key: color.key,
      checkoutVariantId: color.checkout?.variantId || null
    })),
    [
      {
        key: 'blackberry-smoothie',
        checkoutVariantId: 721
      },
      {
        key: 'ogre',
        checkoutVariantId: null
      }
    ]
  );
  assert.deepEqual(
    envelope.products[0].variants.map((variant) => variant.id),
    ['gid://shopify/ProductVariant/721']
  );
});

test('legacy browser projection maps a variant Image ID to its admitted MediaImage', async () => {
  const assignedImageProduct = fixtureProduct({
    id: 'gid://shopify/Product/707',
    handle: 'assigned-image-jig',
    title: 'Assigned Image Jig'
  });
  assignedImageProduct.media.nodes.push({
    __typename: 'MediaImage',
    id: 'gid://shopify/MediaImage/799',
    alt: 'Assigned side image',
    image: {
      id: 'gid://shopify/Image/899',
      url: 'https://cdn.shopify.com/assigned-side.jpg',
      altText: 'Assigned side image',
      width: 1200,
      height: 1200
    }
  });
  assignedImageProduct.variants.nodes[0].image = {
    id: 'gid://shopify/Image/899',
    url: 'https://cdn.shopify.com/assigned-side.jpg',
    altText: 'Assigned side image',
    width: 1200,
    height: 1200
  };

  const envelope = await loadFreshCatalog({ headers: {} }, {
    authenticated: false,
    logger: { warn() {} },
    storefrontRequest: async () => ({
      products: {
        edges: [{ cursor: 'assigned-image', node: assignedImageProduct }],
        pageInfo: { hasNextPage: false, endCursor: 'assigned-image' }
      }
    })
  });

  assert.equal(
    envelope.legacy.products[0].variants[0].image,
    'https://cdn.shopify.com/assigned-side.jpg'
  );
});

test('catalog health rejects unauthorized access and returns safe grouped diagnostics when authorized', async () => {
  const secret = 'fixture-health-secret';
  const catalog = {
    schemaVersion: 2,
    generationId: 'generation-fixture-1',
    generatedAt: '2026-07-26T15:00:00.000Z',
    sourceUpdatedAt: '2026-07-26T14:59:00.000Z',
    freshness: { status: 'fresh', ageSeconds: 12, ttlSeconds: 45 },
    stale: false,
    products: [{
      handle: 'warning-jig',
      presentation: { kind: 'ordinary' }
    }],
    outcomes: {
      accepted: [{ handle: 'warning-jig' }],
      warning: [{
        handle: 'warning-jig',
        severity: 'warning',
        code: 'product_image_missing',
        field: 'media',
        message: 'Warning Jig has no usable product image.',
        remedy: 'Upload at least one product image for the gallery.',
        observedAt: '2026-07-26T15:00:00.000Z'
      }],
      variantBlocked: [],
      productQuarantined: [{
        handle: 'blocked-jig',
        productId: 'gid://shopify/Product/704',
        severity: 'product-quarantined',
        code: 'product_has_no_valid_variants',
        field: 'variants',
        message: 'Blocked Jig has no valid Shopify variants.',
        remedy: 'Repair at least one blocked variant and its price.',
        observedAt: '2026-07-26T15:00:00.000Z'
      }]
    }
  };
  const handler = createCatalogHealthHandler({
    getCatalog: async () => catalog,
    getToken: () => secret
  });

  const unauthorized = responseRecorder();
  await handler({ method: 'GET', headers: {} }, unauthorized);
  assert.equal(unauthorized.statusCode, 401);
  assert.deepEqual(unauthorized.body, {
    ok: false,
    code: 'catalog_health_unauthorized',
    message: 'Unauthorized.'
  });

  const authorized = responseRecorder();
  await handler({
    method: 'GET',
    headers: { authorization: `Bearer ${secret}` }
  }, authorized);

  assert.equal(authorized.statusCode, 200);
  assert.equal(authorized.headers['cache-control'], 'private, no-store');
  assert.equal(authorized.body.generationId, 'generation-fixture-1');
  assert.deepEqual(authorized.body.counts, {
    accepted: 1,
    quarantined: 1,
    variantBlocked: 0,
    warnings: 1,
    customerVisible: 1
  });
  assert.equal(
    authorized.body.issues['warning-jig'].product_image_missing[0].remedy,
    'Upload at least one product image for the gallery.'
  );
  assert.equal(
    authorized.body.issues['blocked-jig'].product_has_no_valid_variants[0].severity,
    'product-quarantined'
  );
  assert.equal(JSON.stringify(authorized.body).includes(secret), false);
  assert.equal(JSON.stringify(authorized.body).includes('SHOPIFY_'), false);
});

test('the public catalog payload admits products without exposing owner diagnostics', () => {
  const payload = publicCatalogPayload({
    ok: true,
    source: 'shopify',
    schemaVersion: 2,
    generationId: 'generation-fixture-1',
    generatedAt: '2026-07-26T15:00:00.000Z',
    sourceUpdatedAt: '2026-07-26T14:59:00.000Z',
    requestId: 'request-fixture-1',
    cache: 'hit',
    dirty: true,
    dirtyAt: '2026-07-26T14:59:59.000Z',
    refreshDueAt: '2026-07-26T14:59:59.250Z',
    lastSuccessfulRefreshAt: '2026-07-26T15:00:00.000Z',
    freshness: { status: 'fresh', ageSeconds: 0, ttlSeconds: 45 },
    stale: false,
    products: [{ handle: 'admitted-jig' }],
    quarantine: [{ handle: 'blocked-jig', code: 'product_identity_invalid' }],
    outcomes: { accepted: [], warning: [], variantBlocked: [], productQuarantined: [] },
    legacy: {
      ok: true,
      source: 'shopify',
      products: [{ handle: 'admitted-jig' }],
      errors: [{ code: 'storefront_token_permissions', message: 'private detail' }]
    }
  });

  assert.equal(payload.generationId, 'generation-fixture-1');
  assert.deepEqual(payload.products, [{ handle: 'admitted-jig' }]);
  assert.equal(Object.hasOwn(payload, 'quarantine'), false);
  assert.equal(Object.hasOwn(payload, 'outcomes'), false);
  assert.equal(Object.hasOwn(payload, 'cache'), false);
  assert.equal(Object.hasOwn(payload, 'dirty'), false);
  assert.equal(Object.hasOwn(payload, 'dirtyAt'), false);
  assert.equal(Object.hasOwn(payload, 'refreshDueAt'), false);
  assert.equal(Object.hasOwn(payload, 'lastSuccessfulRefreshAt'), false);
  assert.equal(Object.hasOwn(payload.legacy, 'errors'), false);
  assert.equal(JSON.stringify(payload).includes('private detail'), false);
});
