'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createGenericProductHandler } = require('../lib/generic-product-route.js');
const { normalizeLines } = require('../api/shopify-cart.js');

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
    send(body) {
      this.body = body;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('an unmatched valid Shopify handle renders the generic product page', async () => {
  const product = {
    id: 'gid://shopify/Product/808',
    handle: '5-8-oz-heavy-cover-football',
    title: '5/8 oz Heavy Cover Football',
    descriptionHtml: '<p>Built for heavy cover.</p>',
    availableForSale: true,
    featuredMediaId: 'gid://shopify/MediaImage/901',
    media: [{
      id: 'gid://shopify/MediaImage/901',
      type: 'image',
      alt: 'Heavy cover football jig',
      image: { url: 'https://cdn.shopify.com/heavy-cover.jpg', width: 1200, height: 1200 }
    }],
    options: [],
    variants: [{
      id: 'gid://shopify/ProductVariant/1001',
      title: 'Default Title',
      selectedOptions: [],
      price: { amount: '5.00', currencyCode: 'USD' },
      compareAtPrice: null,
      availableForSale: true,
      quantityAvailable: 6,
      imageId: 'gid://shopify/MediaImage/901'
    }],
    presentation: { kind: 'ordinary' }
  };
  const handler = createGenericProductHandler({
    getCatalog: async () => ({
      schemaVersion: 2,
      products: [product],
      quarantine: []
    })
  });
  const response = responseRecorder();

  await handler(
    { method: 'GET', query: { handle: product.handle }, headers: {} },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['content-type'], /^text\/html/);
  assert.match(response.body, /5\/8 oz Heavy Cover Football/);
  assert.match(response.body, /data-generic-product/);
  assert.match(response.body, /gid:\/\/shopify\/ProductVariant\/1001/);
});

test('absent, quarantined, and malformed handles return a real not-found response', async () => {
  const catalog = {
    schemaVersion: 2,
    products: [],
    quarantine: [{
      handle: 'quarantined-jig',
      severity: 'product-quarantined',
      code: 'product_has_no_valid_variants'
    }]
  };
  const handler = createGenericProductHandler({ getCatalog: async () => catalog });

  for (const handle of ['absent-jig', 'quarantined-jig', '../catalog']) {
    const response = responseRecorder();
    await handler({ method: 'GET', query: { handle }, headers: {} }, response);
    assert.equal(response.statusCode, 404, handle);
    assert.equal(response.headers['cache-control'], 'no-store', handle);
    assert.match(response.body, /Product not found/, handle);
  }
});

test('the hidden rattle add-on never resolves through the customer product route', async () => {
  const handler = createGenericProductHandler({
    getCatalog: async () => ({
      schemaVersion: 2,
      products: [{
        handle: 'rattle-add-on',
        presentation: { kind: 'hidden-add-on' }
      }]
    })
  });
  const response = responseRecorder();

  await handler(
    { method: 'GET', query: { handle: 'rattle-add-on' }, headers: {} },
    response
  );

  assert.equal(response.statusCode, 404);
});

test('Vercel preserves an established static product before the generic fallback rewrite', () => {
  const root = path.resolve(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const staticPage = fs.readFileSync(
    path.join(root, 'products', 'heavy-cover-football.html'),
    'utf8'
  );

  assert.match(staticPage, /<title>3\/4 Heavy Cover Football \| Bass Binge Baits<\/title>/);
  assert.deepEqual(config.rewrites, [{
    source: '/products/:handle',
    destination: '/api/product?handle=:handle'
  }]);
});

test('Shopify cart request normalization preserves exact variant GID and money', () => {
  assert.deepEqual(normalizeLines({
    lines: [{
      merchandiseId: 'gid://shopify/ProductVariant/1001',
      quantity: 2,
      configurationId: 'gid://shopify/ProductVariant/1001',
      price: { amount: '6.75', currencyCode: 'USD' }
    }]
  }), [{
    merchandiseId: 'gid://shopify/ProductVariant/1001',
    rattleMerchandiseId: null,
    quantity: 2,
    configurationId: 'gid://shopify/ProductVariant/1001',
    price: { amount: '6.75', currencyCode: 'USD' }
  }]);
});
