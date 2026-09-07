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

test('variant deep links keep an unavailable Shopify variant selected in server HTML and JSON-LD', async () => {
  const product = {
    handle: 'limited-craw',
    title: 'Limited <Craw>',
    descriptionHtml: '<p>Two color options.</p>',
    vendor: 'Bass Binge Baits',
    media: [
      { id: 'green-image', type: 'image', image: { url: 'https://cdn.shopify.com/limited-craw-green.jpg' } },
      { id: 'purple-image', type: 'image', image: { url: 'https://cdn.shopify.com/limited-craw-purple.jpg' } }
    ],
    options: [{ name: 'Color', values: [{ name: 'Green' }, { name: 'Purple' }] }],
    variants: [
      {
        id: 'gid://shopify/ProductVariant/101',
        selectedOptions: [{ name: 'Color', value: 'Green' }],
        price: { amount: '4.00', currencyCode: 'USD' },
        availableForSale: true,
        imageId: 'green-image'
      },
      {
        id: 'gid://shopify/ProductVariant/202',
        selectedOptions: [{ name: 'Color', value: 'Purple' }],
        price: { amount: '6.50', currencyCode: 'USD' },
        availableForSale: false,
        imageId: 'purple-image'
      }
    ],
    presentation: { kind: 'ordinary' }
  };
  const handler = createGenericProductHandler({
    getCatalog: async () => ({ schemaVersion: 2, products: [product], quarantine: [] })
  });

  const selected = responseRecorder();
  await handler({ method: 'GET', query: { handle: product.handle, variant: '202' }, headers: {} }, selected);
  assert.equal(selected.statusCode, 200);
  assert.match(selected.body, /data-price-display>\$6\.50<\/p>/);
  assert.match(selected.body, /This option is unavailable\.<\/p>/);
  assert.match(selected.body, /data-add-cart disabled>Unavailable<\/button>/);
  assert.match(selected.body, /<meta property="og:image" content="https:\/\/cdn\.shopify\.com\/limited-craw-purple\.jpg" \/>/);
  assert.match(selected.body, /<div class="product-gallery-slide active"><img src="https:\/\/cdn\.shopify\.com\/limited-craw-purple\.jpg"/);
  const jsonLd = JSON.parse(selected.body.match(/<script id="generic-product-jsonld" type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(jsonLd['@type'], 'ProductGroup');
  assert.equal(jsonLd['@id'], 'https://www.bassbingebaits.com/products/limited-craw#product-group');
  assert.equal(jsonLd.productGroupID, 'limited-craw');
  assert.deepEqual(jsonLd.variesBy, ['https://schema.org/color']);
  assert.equal(jsonLd.hasVariant.length, 2);
  assert.deepEqual(
    jsonLd.hasVariant.map((variant) => ({
      id: variant['@id'],
      group: variant.inProductGroupWithID,
      name: variant.name,
      description: variant.description,
      image: variant.image,
      color: variant.color
    })),
    [
      {
        id: 'https://www.bassbingebaits.com/products/limited-craw?variant=101#product',
        group: 'limited-craw',
        name: 'Limited <Craw> - Green',
        description: 'Two color options.',
        image: 'https://cdn.shopify.com/limited-craw-green.jpg',
        color: 'Green'
      },
      {
        id: 'https://www.bassbingebaits.com/products/limited-craw?variant=202#product',
        group: 'limited-craw',
        name: 'Limited <Craw> - Purple',
        description: 'Two color options.',
        image: 'https://cdn.shopify.com/limited-craw-purple.jpg',
        color: 'Purple'
      }
    ]
  );
  assert.deepEqual(jsonLd.hasVariant.map((variant) => variant.offers), [
    {
      '@type': 'Offer',
      url: 'https://www.bassbingebaits.com/products/limited-craw?variant=101',
      priceCurrency: 'USD',
      price: '4.00',
      itemCondition: 'https://schema.org/NewCondition',
      availability: 'https://schema.org/InStock'
    },
    {
      '@type': 'Offer',
      url: 'https://www.bassbingebaits.com/products/limited-craw?variant=202',
      priceCurrency: 'USD',
      price: '6.50',
      itemCondition: 'https://schema.org/NewCondition',
      availability: 'https://schema.org/OutOfStock'
    }
  ]);
  assert.doesNotMatch(selected.body, /<Craw>/);

  const invalid = responseRecorder();
  await handler({ method: 'GET', query: { handle: product.handle, variant: 'not-a-variant' }, headers: {} }, invalid);
  assert.equal(invalid.statusCode, 200);
  assert.match(invalid.body, /data-price-display>\$4\.00<\/p>/);
});

test('Heartlander selects the current Shopify variant image ahead of the remaining media', () => {
  const renderer = require('../assets/js/generic-product-page.js');
  const product = {
    title: 'Heartlander',
    media: [
      { id: 'other', type: 'image', image: { url: 'https://cdn.shopify.com/other.jpg' } },
      { id: 'selected', type: 'image', image: { url: 'https://cdn.shopify.com/heartlander.jpg' } }
    ]
  };
  const media = renderer.orderedMedia(product, { imageId: 'selected' });
  assert.equal(media[0].id, 'selected');
  assert.deepEqual(media.map((item) => item.id), ['selected', 'other']);
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

test('all product URLs use the current admitted server renderer', () => {
  const root = path.resolve(__dirname, '..');
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const directory = path.join(root, 'products');
  assert.equal(fs.existsSync(directory) ? fs.readdirSync(directory).filter(name => name.endsWith('.html')).length : 0, 0);
  assert.ok(config.rewrites.some(rule => rule.source === '/products/:handle' && rule.destination === '/api/product?handle=:handle'));
  const { renderGenericProductPage } = require('../lib/generic-product-route.js');
  const html = renderGenericProductPage({ handle: 'jig', title: 'Jig', descriptionHtml: '<p>Live description</p>' });
  assert.match(html, /<main class="product-page">/);
  assert.match(html, /data-quantity-decrease[\s\S]*data-quantity-input[\s\S]*data-quantity-increase[\s\S]*data-add-cart disabled/);
  assert.match(html, /Live description/);
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

test('legacy jig color labels produce complete color variation data', () => {
  const { productStructuredData } = require('../lib/generic-product-route');
  for (const [handle, name] of [['3-4-oz-football-jig', '3/4 oz.'], ['pee-wee-football', 'Pee Wee + colors']]) {
    const product = { id: handle, handle, title: 'Jig', options: [{ name }], variants: ['Fruit Fly', 'Craw Essence'].map((value, index) => ({
      id: String(900 + index), selectedOptions: [{ name, value }], availableForSale: true, price: { amount: '5.0', currencyCode: 'USD' }
    })) };
    const data = productStructuredData(product, 'Jig', null, 'https://www.bassbingebaits.com/products/' + handle);
    assert.deepEqual(data.variesBy, ['https://schema.org/color']);
    assert.deepEqual(data.hasVariant.map(item => item.color), ['Fruit Fly', 'Craw Essence']);
  }
});
