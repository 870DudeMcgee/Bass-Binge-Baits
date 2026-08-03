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

test('a color-only Shopify product renders an option-capable product-page shell', async () => {
  const product = {
    id: 'gid://shopify/Product/808',
    handle: 'chopped-craw-6-pack',
    title: 'Chopped Craw (6 pack)',
    descriptionHtml: '<p>Jewell Baits craw built for finesse presentations.</p>',
    availableForSale: true,
    featuredMediaId: 'gid://shopify/MediaImage/901',
    media: [{
      id: 'gid://shopify/MediaImage/901',
      type: 'image',
      alt: 'Chopped Craw colors',
      image: { url: 'https://cdn.shopify.com/chopped-craw.jpg', width: 1200, height: 1200 }
    }],
    options: [{
      id: 'gid://shopify/ProductOption/1',
      name: 'Color',
      values: [
        { id: 'green', name: 'Green Pumpkin' },
        { id: 'pbj', name: 'PBJ' }
      ]
    }],
    variants: [
      {
        id: 'gid://shopify/ProductVariant/1001',
        title: 'Green Pumpkin',
        selectedOptions: [{ name: 'Color', value: 'Green Pumpkin' }],
        price: { amount: '3.5', currencyCode: 'USD' },
        compareAtPrice: null,
        availableForSale: true,
        quantityAvailable: 12,
        imageId: 'gid://shopify/MediaImage/901'
      },
      {
        id: 'gid://shopify/ProductVariant/1002',
        title: 'PBJ',
        selectedOptions: [{ name: 'Color', value: 'PBJ' }],
        price: { amount: '3.5', currencyCode: 'USD' },
        compareAtPrice: null,
        availableForSale: true,
        quantityAvailable: 12,
        imageId: 'gid://shopify/MediaImage/901'
      }
    ],
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
  assert.match(response.body, /Chopped Craw \(6 pack\)/);
  assert.doesNotMatch(response.body, /Jewell/);
  assert.match(response.body, /Jewel Baits craw built for finesse presentations\./);
  assert.match(response.body, /\/assets\/img\/jewel-bait-logo\.png/);
  assert.match(response.body, /Jewel Finesse Craw/);
  assert.match(response.body, /data-generic-product/);
  assert.match(response.body, /class="product-page"/);
  assert.match(response.body, /data-generic-options/);
  assert.match(response.body, /gid:\/\/shopify\/ProductVariant\/1001/);
  assert.match(
    response.body,
    /data-quantity-decrease[\s\S]*data-quantity-input[\s\S]*data-quantity-increase[\s\S]*data-add-cart/
  );
  assert.match(response.body, /\/assets\/js\/generic-product-page\.js/);
  assert.doesNotMatch(response.body, /\/assets\/js\/product-page\.js/);
});

test('the curated Heartlander page loads ordered Shopify media before its product renderer', () => {
  const root = path.resolve(__dirname, '..');
  const heartlanderPage = fs.readFileSync(
    path.join(root, 'products', 'limited-drop.html'),
    'utf8'
  );
  const productRenderer = fs.readFileSync(
    path.join(root, 'assets', 'js', 'product-page.js'),
    'utf8'
  );

  assert.match(
    heartlanderPage,
    /limited-drop-gallery\.js[\s\S]*product-page\.js/
  );
  assert.match(
    productRenderer,
    /getAdmittedProduct\(product\.handle\)[\s\S]*mediaItems\(admittedProduct\)/
  );
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

test('an established static SEO shell stays behind the live-catalog admission gate', () => {
  const root = path.resolve(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const staticPage = fs.readFileSync(
    path.join(root, 'products', 'heavy-cover-football.html'),
    'utf8'
  );

  assert.match(staticPage, /<title>3\/4 Heavy Cover Football \| Bass Binge Baits<\/title>/);
  assert.match(staticPage, /<main class="product-page" hidden>/);
  assert.ok(config.rewrites.some((rewrite) => rewrite.source === '/shop/:category(jigs|trailers|apparel)' && rewrite.destination === '/shop.html'));
  assert.ok(config.rewrites.some((rewrite) => JSON.stringify(rewrite) === JSON.stringify({
    source: '/products/:handle',
    destination: '/api/product?handle=:handle'
  })));
});

test('every established product page places quantity before Add to Cart', () => {
  const root = path.resolve(__dirname, '..');
  const productDir = path.join(root, 'products');
  const pages = fs.readdirSync(productDir).filter((name) => name.endsWith('.html'));

  assert.ok(pages.length > 0);
  for (const page of pages) {
    const html = fs.readFileSync(path.join(productDir, page), 'utf8');
    assert.match(
      html,
      /data-quantity-decrease[\s\S]*data-quantity-input[\s\S]*data-quantity-increase[\s\S]*data-add-cart/,
      page
    );
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
