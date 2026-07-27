'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
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

function admittedProduct(handle, overrides = {}) {
  return Object.assign({
    id: `gid://shopify/Product/${handle}`,
    handle,
    title: handle === 'heavy-cover-football' ? '3/4 Heavy Cover Football' : 'Novel Jig',
    descriptionHtml: '<p>Approved live product description.</p>',
    availableForSale: true,
    media: [{
      id: `gid://shopify/MediaImage/${handle}`,
      type: 'image',
      alt: `${handle} product image`,
      image: { url: 'https://cdn.shopify.com/product.jpg', width: 1200, height: 1200 }
    }],
    options: [],
    variants: [{
      id: `gid://shopify/ProductVariant/${handle}`,
      title: 'Default Title',
      selectedOptions: [],
      price: { amount: '5.00', currencyCode: 'USD' },
      compareAtPrice: null,
      availableForSale: true,
      quantityAvailable: 6,
      imageId: null
    }],
    presentation: { kind: 'ordinary' }
  }, overrides);
}

const unavailableScenarios = [
  { name: 'deleted', handle: 'deleted-jig', state: 'deleted', status: 404, title: 'Product not found' },
  { name: 'quarantined', handle: 'quarantined-jig', state: 'quarantined', status: 404, title: 'Product not found' },
  { name: 'expired-stale', handle: 'expired-stale', state: 'expired-stale', status: 503, title: 'Product temporarily unavailable' }
];

function catalogForState(handle, state = 'admitted') {
  if (state === 'expired-stale') {
    const error = new Error('The bounded stale window expired.');
    error.statusCode = 503;
    error.details = { reason: 'stale_window_expired' };
    throw error;
  }
  return {
    schemaVersion: 2,
    products: state === 'admitted' ? [admittedProduct(handle)] : [],
    quarantine: state === 'quarantined'
      ? [{ handle, severity: 'product-quarantined', code: 'product_image_missing' }]
      : []
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

test('the Heartlander limited drop route embeds every ordered Shopify media item and exact variant', async () => {
  const product = admittedProduct('heartlander-peewee-football-hd', {
    id: 'gid://shopify/Product/11054574338215',
    title: '5/8 oz PeeWee Football HD — Heartlander',
    presentation: {
      kind: 'limited-drop',
      dropStartsAt: '2026-07-19T21:39:06Z',
      dropEndsAt: '2026-08-19T21:39:06Z'
    },
    media: [
      {
        id: 'gid://shopify/MediaImage/heartlander-main',
        type: 'image',
        alt: 'Heartlander jig',
        image: { url: 'https://cdn.shopify.com/heartlander-main.jpg', width: 1200, height: 1200 }
      },
      {
        id: 'gid://shopify/Video/heartlander',
        type: 'video',
        alt: 'Heartlander jig video',
        sources: [{ url: 'https://cdn.shopify.com/heartlander.mp4', mimeType: 'video/mp4' }]
      },
      ...['detail-one', 'detail-two', 'reverse'].map((name) => ({
        id: `gid://shopify/MediaImage/${name}`,
        type: 'image',
        alt: `Heartlander ${name}`,
        image: { url: `https://cdn.shopify.com/heartlander-${name}.jpg`, width: 1200, height: 1200 }
      }))
    ],
    options: [
      { id: 'color', name: 'Color', values: [{ id: 'heartlander', name: 'Heartlander' }] },
      { id: 'weight', name: 'Weight', values: [{ id: '5-8-oz', name: '5/8 oz' }] }
    ],
    variants: [{
      id: 'gid://shopify/ProductVariant/51000785633447',
      title: 'Heartlander / 5/8 oz',
      selectedOptions: [
        { name: 'Color', value: 'Heartlander' },
        { name: 'Weight', value: '5/8 oz' }
      ],
      price: { amount: '5.99', currencyCode: 'USD' },
      compareAtPrice: null,
      availableForSale: true,
      quantityAvailable: 6,
      imageId: 'gid://shopify/MediaImage/heartlander-main'
    }]
  });
  const handler = createGenericProductHandler({
    getCatalog: async () => ({ schemaVersion: 2, products: [product], quarantine: [] })
  });
  const response = responseRecorder();

  await handler(
    { method: 'GET', query: { handle: product.handle }, headers: {} },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /5\/8 oz PeeWee Football HD/);
  assert.match(response.body, /heartlander-main\.jpg/);
  assert.match(response.body, /heartlander\.mp4/);
  assert.match(response.body, /heartlander-detail-one\.jpg/);
  assert.match(response.body, /heartlander-detail-two\.jpg/);
  assert.match(response.body, /heartlander-reverse\.jpg/);
  assert.match(response.body, /gid:\/\/shopify\/ProductVariant\/51000785633447/);
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

test('established product filenames cannot bypass the handle admission route', async () => {
  const root = path.resolve(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const publicProductsDirectory = path.join(root, 'products');
  const publicProductFiles = fs.existsSync(publicProductsDirectory)
    ? fs.readdirSync(publicProductsDirectory).filter((file) => file.endsWith('.html'))
    : [];
  assert.deepEqual(publicProductFiles, []);
  assert.deepEqual(config.rewrites, [{
    source: '/products/:handle',
    destination: '/api/product?handle=:handle'
  }]);

  const handler = createGenericProductHandler({
    getCatalog: async () => ({
      schemaVersion: 2,
      products: [admittedProduct('heavy-cover-football', {
        descriptionHtml: '<p>Current Shopify product description.</p>',
      })]
    })
  });
  const response = responseRecorder();

  await handler(
    { method: 'GET', query: { handle: 'heavy-cover-football' }, headers: {} },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /<meta name="description" content="Current Shopify product description\." \/>/);
  assert.match(response.body, /<meta property="og:description" content="Current Shopify product description\." \/>/);
  assert.match(response.body, /Current Shopify product description\./);
  assert.match(response.body, /class="site-header"/);
  assert.match(response.body, /class="product-hero"/);
});

test('an established product handle returns the current deleted, quarantined, or unavailable state', async () => {
  const handle = 'heavy-cover-football';
  for (const scenario of unavailableScenarios) {
    const handler = createGenericProductHandler({
      getCatalog: async () => catalogForState(handle, scenario.state)
    });
    const response = responseRecorder();
    await handler({ method: 'GET', query: { handle }, headers: {} }, response);

    assert.equal(response.statusCode, scenario.status, scenario.name);
    assert.match(response.headers['content-type'], /^text\/html/, scenario.name);
    assert.equal(response.headers['cache-control'], 'no-store', scenario.name);
    assert.match(response.body, new RegExp(scenario.title), scenario.name);
    assert.doesNotMatch(response.body, /data-generic-product/, scenario.name);
  }
});

test('local product HTTP serves established and novel handles through one admission gate', async (t) => {
  const handler = createGenericProductHandler({
    getCatalog: async (request) => {
      const handle = request.query.handle;
      const unavailable = unavailableScenarios.find((scenario) => scenario.handle === handle);
      const state = unavailable ? unavailable.state : 'admitted';
      return catalogForState(handle, state);
    }
  });
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const handle = url.pathname.startsWith('/products/')
      ? decodeURIComponent(url.pathname.slice('/products/'.length))
      : '';
    handler(
      { method: request.method, query: { handle }, headers: request.headers },
      {
        setHeader: response.setHeader.bind(response),
        status(statusCode) {
          response.statusCode = statusCode;
          return this;
        },
        send(body) {
          response.end(body);
        }
      }
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));
  const { port } = server.address();

  for (const handle of ['heavy-cover-football', 'novel-jig']) {
    const response = await fetch(`http://127.0.0.1:${port}/products/${handle}`);
    const body = await response.text();
    assert.equal(response.status, 200, handle);
    assert.match(response.headers.get('content-type'), /^text\/html/, handle);
    assert.match(body, /data-generic-product/, handle);
    assert.match(body, /class="product-hero"/, handle);
  }

  for (const scenario of unavailableScenarios) {
    const response = await fetch(`http://127.0.0.1:${port}/products/${scenario.handle}`);
    const body = await response.text();
    assert.equal(response.status, scenario.status, scenario.handle);
    assert.match(response.headers.get('content-type'), /^text\/html/, scenario.handle);
    assert.match(body, new RegExp(scenario.title), scenario.handle);
    assert.doesNotMatch(body, /data-generic-product/, scenario.handle);
  }
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

test('Shopify cart request normalization preserves the exact Heartlander variant', () => {
  assert.deepEqual(normalizeLines({
    lines: [{
      merchandiseId: 'gid://shopify/ProductVariant/51000785633447',
      quantity: 1,
      configurationId: 'gid://shopify/ProductVariant/51000785633447',
      price: { amount: '5.99', currencyCode: 'USD' }
    }]
  }), [{
    merchandiseId: 'gid://shopify/ProductVariant/51000785633447',
    rattleMerchandiseId: null,
    quantity: 1,
    configurationId: 'gid://shopify/ProductVariant/51000785633447',
    price: { amount: '5.99', currencyCode: 'USD' }
  }]);
});
