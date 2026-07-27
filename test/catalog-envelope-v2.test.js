'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fixtures = require('./fixtures/catalog-envelope-v2.json');
const { normalizeCatalogEnvelope } = require('../lib/catalog-envelope.js');
const { loadFreshCatalog } = require('../lib/shopify-catalog.js');

function fixtureProduct(overrides = {}) {
  const product = structuredClone(fixtures.colorOnly);
  return Object.assign(product, overrides);
}

test('CatalogEnvelope v2 preserves a Color-only product and exact variant money', () => {
  const envelope = normalizeCatalogEnvelope([fixtures.colorOnly], {
    generatedAt: '2026-07-26T13:00:00.000Z',
    requestId: 'fixture-request'
  });

  assert.equal(envelope.schemaVersion, 2);
  assert.equal(envelope.products.length, 1);
  assert.deepEqual(envelope.products[0].options, [
    {
      id: 'gid://shopify/ProductOption/201',
      name: 'Color',
      values: [
        { id: 'gid://shopify/ProductOptionValue/301', name: 'Black' },
        { id: 'gid://shopify/ProductOptionValue/302', name: 'Blue' }
      ]
    }
  ]);
  assert.deepEqual(envelope.products[0].variants[1].selectedOptions, [
    { name: 'Color', value: 'Blue' }
  ]);
  assert.deepEqual(envelope.products[0].variants[1].price, {
    amount: '5.25',
    currencyCode: 'USD'
  });
  assert.deepEqual(envelope.products[0].variants[1].compareAtPrice, {
    amount: '6.00',
    currencyCode: 'USD'
  });
  assert.equal(envelope.products[0].variants[1].availableForSale, false);
  assert.deepEqual(envelope.products[0].variants[0].image, {
    id: 'gid://shopify/Image/601',
    url: 'https://cdn.shopify.com/color-only-black.jpg',
    alt: 'Black jig',
    width: 1200,
    height: 1200
  });
  assert.equal(envelope.outcomes.accepted.length, 1);
});

test('CatalogEnvelope v2 removes Shopify default-title scaffolding for a product with no meaningful options', () => {
  const product = fixtureProduct({
    id: 'gid://shopify/Product/102',
    handle: 'default-variant',
    title: 'Default Variant Product',
    options: [{
      id: 'gid://shopify/ProductOption/202',
      name: 'Title',
      optionValues: [{ id: 'gid://shopify/ProductOptionValue/303', name: 'Default Title' }]
    }]
  });
  product.variants.nodes = [{
    ...product.variants.nodes[0],
    id: 'gid://shopify/ProductVariant/403',
    title: 'Default Title',
    selectedOptions: [{ name: 'Title', value: 'Default Title' }]
  }];

  const envelope = normalizeCatalogEnvelope([product]);

  assert.deepEqual(envelope.products[0].options, []);
  assert.deepEqual(envelope.products[0].variants[0].selectedOptions, []);
});

test('CatalogEnvelope v2 preserves a Weight-only option without inventing Color', () => {
  const product = fixtureProduct({
    id: 'gid://shopify/Product/103',
    handle: 'weight-only',
    title: 'Weight Only Jig',
    options: [{
      id: 'gid://shopify/ProductOption/203',
      name: 'Weight',
      optionValues: [
        { id: 'gid://shopify/ProductOptionValue/304', name: '3/8 oz' },
        { id: 'gid://shopify/ProductOptionValue/305', name: '1/2 oz' }
      ]
    }]
  });
  product.variants.nodes = product.variants.nodes.map((variant, index) => ({
    ...variant,
    id: `gid://shopify/ProductVariant/${404 + index}`,
    title: index ? '1/2 oz' : '3/8 oz',
    selectedOptions: [{ name: 'Weight', value: index ? '1/2 oz' : '3/8 oz' }]
  }));

  const envelope = normalizeCatalogEnvelope([product]);

  assert.deepEqual(envelope.products[0].options.map((option) => option.name), ['Weight']);
  assert.deepEqual(envelope.products[0].variants[0].selectedOptions, [
    { name: 'Weight', value: '3/8 oz' }
  ]);
});

test('CatalogEnvelope v2 preserves arbitrary Style and Size tuples in Shopify order', () => {
  const product = fixtureProduct({
    id: 'gid://shopify/Product/104',
    handle: 'style-size',
    title: 'Style and Size Trailer',
    options: [
      {
        id: 'gid://shopify/ProductOption/204',
        name: 'Style',
        optionValues: [
          { id: 'gid://shopify/ProductOptionValue/306', name: 'Craw' },
          { id: 'gid://shopify/ProductOptionValue/307', name: 'Minnow' }
        ]
      },
      {
        id: 'gid://shopify/ProductOption/205',
        name: 'Size',
        optionValues: [
          { id: 'gid://shopify/ProductOptionValue/308', name: 'Small' },
          { id: 'gid://shopify/ProductOptionValue/309', name: 'Large' }
        ]
      }
    ]
  });
  product.variants.nodes = [
    {
      ...product.variants.nodes[0],
      id: 'gid://shopify/ProductVariant/406',
      selectedOptions: [
        { name: 'Style', value: 'Craw' },
        { name: 'Size', value: 'Small' }
      ]
    },
    {
      ...product.variants.nodes[1],
      id: 'gid://shopify/ProductVariant/407',
      selectedOptions: [
        { name: 'Style', value: 'Minnow' },
        { name: 'Size', value: 'Large' }
      ]
    }
  ];

  const envelope = normalizeCatalogEnvelope([product]);

  assert.deepEqual(envelope.products[0].options.map((option) => option.name), ['Style', 'Size']);
  assert.deepEqual(envelope.products[0].variants[1].selectedOptions, [
    { name: 'Style', value: 'Minnow' },
    { name: 'Size', value: 'Large' }
  ]);
});

test('CatalogEnvelope v2 preserves the complete ordered media gallery', () => {
  const product = fixtureProduct({
    id: 'gid://shopify/Product/105',
    handle: 'multiple-images',
    title: 'Multiple Images Jig'
  });
  product.media.nodes.push({
    __typename: 'MediaImage',
    id: 'gid://shopify/MediaImage/502',
    alt: 'Side view',
    image: {
      url: 'https://cdn.shopify.com/multiple-images-side.jpg',
      altText: 'Side view',
      width: 1600,
      height: 1200
    }
  });

  const envelope = normalizeCatalogEnvelope([product]);

  assert.deepEqual(
    envelope.products[0].media.map((media) => media.id),
    ['gid://shopify/MediaImage/501', 'gid://shopify/MediaImage/502']
  );
});

test('loadFreshCatalog uses featuredImage instead of the invalid Product.featuredMedia field', async () => {
  const product = fixtureProduct({
    featuredMedia: undefined,
    featuredImage: {
      id: 'gid://shopify/ProductImage/featured',
      url: 'https://cdn.shopify.com/featured.jpg',
      altText: 'Featured view',
      width: 1600,
      height: 1200
    }
  });
  product.media.nodes.push({
    __typename: 'MediaImage',
    id: 'gid://shopify/MediaImage/featured',
    alt: 'Featured view',
    image: {
      id: product.featuredImage.id,
      url: product.featuredImage.url,
      altText: product.featuredImage.altText,
      width: product.featuredImage.width,
      height: product.featuredImage.height
    }
  });

  const envelope = await loadFreshCatalog({ headers: {} }, {
    authenticated: false,
    generatedAt: '2026-07-27T12:00:00.000Z',
    storefrontRequest: async (query) => {
      assert.doesNotMatch(query, /\bfeaturedMedia\b/);
      assert.match(query, /featuredImage\s*\{\s*id\b/);
      return {
        products: {
          edges: [{ cursor: 'product-1', node: product }],
          pageInfo: { hasNextPage: false, endCursor: 'product-1' }
        }
      };
    }
  });

  assert.equal(envelope.products[0].featuredMediaId, product.featuredImage.id);
  assert.equal(envelope.legacy.products[0].featuredImage, product.featuredImage.url);
});

test('CatalogEnvelope v2 warns and accepts a product with no image', () => {
  const product = fixtureProduct({
    id: 'gid://shopify/Product/106',
    handle: 'missing-image',
    title: 'Missing Image Jig',
    featuredMedia: null,
    media: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }
  });

  const envelope = normalizeCatalogEnvelope([product]);

  assert.equal(envelope.products.length, 1);
  assert.equal(envelope.outcomes.warning[0].code, 'product_image_missing');
});

test('CatalogEnvelope v2 blocks one malformed variant but keeps valid variants sellable', () => {
  const product = fixtureProduct({
    id: 'gid://shopify/Product/107',
    handle: 'malformed-variant',
    title: 'Malformed Variant Jig'
  });
  product.variants.nodes[1].price = { amount: 'not-money', currencyCode: 'USD' };

  const envelope = normalizeCatalogEnvelope([product]);

  assert.equal(envelope.products.length, 1);
  assert.deepEqual(envelope.products[0].variants.map((variant) => variant.id), [
    'gid://shopify/ProductVariant/401'
  ]);
  assert.equal(envelope.outcomes.variantBlocked[0].code, 'variant_money_invalid');
});

test('CatalogEnvelope v2 quarantines a product with no valid variants', () => {
  const product = fixtureProduct({
    id: 'gid://shopify/Product/112',
    handle: 'no-valid-variants',
    title: 'No Valid Variants Jig'
  });
  product.variants.nodes = [{
    ...product.variants.nodes[0],
    price: { amount: 'invalid', currencyCode: 'USD' }
  }];

  const envelope = normalizeCatalogEnvelope([product]);

  assert.equal(envelope.products.length, 0);
  assert.equal(
    envelope.outcomes.productQuarantined.some((issue) => issue.code === 'product_has_no_valid_variants'),
    true
  );
});

test('CatalogEnvelope v2 retains a sold-out product and exact availability', () => {
  const product = fixtureProduct({
    id: 'gid://shopify/Product/108',
    handle: 'sold-out',
    title: 'Sold Out Jig',
    availableForSale: false
  });
  product.variants.nodes = product.variants.nodes.map((variant) => ({
    ...variant,
    availableForSale: false,
    quantityAvailable: 0
  }));

  const envelope = normalizeCatalogEnvelope([product]);

  assert.equal(envelope.products[0].availableForSale, false);
  assert.equal(envelope.products[0].variants.every((variant) => !variant.availableForSale), true);
});

test('CatalogEnvelope v2 classifies the hidden add-on only from validated type/tag data', () => {
  const product = fixtureProduct({
    id: 'gid://shopify/Product/109',
    handle: 'ordinary-looking-handle',
    title: 'An Ordinary Looking Title',
    productType: 'Rattle Add-on',
    tags: ['rattle-add-on']
  });

  const envelope = normalizeCatalogEnvelope([product]);

  assert.equal(envelope.products[0].presentation.kind, 'hidden-add-on');
});

test('CatalogEnvelope v2 admits a hidden Rattle Add-on without customer-facing media', () => {
  const product = fixtureProduct({
    id: 'gid://shopify/Product/114',
    handle: 'rattle-add-on',
    title: 'Rattle Add-on',
    productType: 'Rattle Add-on',
    tags: ['rattle-add-on'],
    featuredImage: null,
    featuredMedia: null,
    media: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }
  });

  const envelope = normalizeCatalogEnvelope([product]);

  assert.deepEqual(envelope.products.map((item) => item.handle), ['rattle-add-on']);
  assert.equal(envelope.products[0].presentation.kind, 'hidden-add-on');
  assert.equal(
    envelope.outcomes.productQuarantined.some((issue) => issue.code === 'product_image_missing'),
    false
  );
});

test('CatalogEnvelope v2 validates a limited drop from classification and typed timing metafields', () => {
  const product = fixtureProduct({
    id: 'gid://shopify/Product/110',
    handle: 'summer-craw-drop',
    title: 'Summer Craw',
    productType: 'Limited Drop',
    tags: ['limited-drop'],
    metafields: [
      { namespace: 'bass_binge', key: 'drop_starts_at', value: '2026-07-26T15:00:00Z', type: 'date_time' },
      { namespace: 'bass_binge', key: 'drop_ends_at', value: '2026-07-28T15:00:00Z', type: 'date_time' },
      { namespace: 'bass_binge', key: 'badge_text', value: 'Weekend drop', type: 'single_line_text_field' }
    ]
  });

  const envelope = normalizeCatalogEnvelope([product]);

  assert.equal(envelope.products[0].presentation.kind, 'limited-drop');
  assert.equal(envelope.products[0].presentation.badgeText, 'Weekend drop');
  assert.equal(envelope.outcomes.productQuarantined.length, 0);
});

test('Heartlander remains a first-class limited-drop product with its own route, gallery, and exact variant', async () => {
  const product = fixtureProduct({
    id: 'gid://shopify/Product/11054574338215',
    handle: 'limited-drop',
    title: '5/8 oz PeeWee Football HD — Heartlander',
    description: 'Limited time! HEARTLANDER JIG Jewel Baits 5/8 PeeWee Football HD Premium skirt, Boss skirt collar, custom Stardust Painted jighead!!!',
    descriptionHtml: '<p>Premium skirt, Boss skirt collar, and custom Stardust-painted jighead.</p>',
    productType: 'Limited Drop',
    tags: ['limited-drop'],
    options: [
      {
        id: 'gid://shopify/ProductOption/heartlander-color',
        name: 'Color',
        optionValues: [{ id: 'gid://shopify/ProductOptionValue/heartlander', name: 'Heartlander' }]
      },
      {
        id: 'gid://shopify/ProductOption/heartlander-weight',
        name: 'Weight',
        optionValues: [{ id: 'gid://shopify/ProductOptionValue/5-8-oz', name: '5/8 oz' }]
      }
    ],
    publishedAt: '2026-07-02T10:58:46Z',
    metafields: []
  });
  product.variants.nodes = [{
    ...product.variants.nodes[0],
    id: 'gid://shopify/ProductVariant/51000785633447',
    title: 'Heartlander / 5/8 oz',
    price: { amount: '5.99', currencyCode: 'USD' },
    selectedOptions: [
      { name: 'Color', value: 'Heartlander' },
      { name: 'Weight', value: '5/8 oz' }
    ]
  }];
  product.media.nodes = [
    product.media.nodes[0],
    {
      __typename: 'Video',
      id: 'gid://shopify/Video/heartlander',
      alt: 'Heartlander jig video',
      sources: [{
        url: 'https://cdn.shopify.com/videos/heartlander-1080.mp4',
        mimeType: 'video/mp4',
        format: 'mp4',
        height: 1080,
        width: 1920
      }]
    },
    ...['detail-one', 'detail-two', 'reverse'].map((name) => ({
      __typename: 'MediaImage',
      id: `gid://shopify/MediaImage/${name}`,
      alt: `Heartlander ${name}`,
      image: {
        id: `gid://shopify/Image/${name}`,
        url: `https://cdn.shopify.com/heartlander-${name}.jpg`,
        altText: `Heartlander ${name}`,
        width: 1200,
        height: 1200
      }
    }))
  ];

  const catalog = await loadFreshCatalog({ headers: {} }, {
    authenticated: true,
    generatedAt: '2026-07-27T12:00:00.000Z',
    storefrontRequest: async () => ({
      products: {
        edges: [{ cursor: 'heartlander', node: product }],
        pageInfo: { hasNextPage: false, endCursor: 'heartlander' }
      }
    })
  });

  assert.deepEqual(catalog.products.map((item) => item.handle), [
    'limited-drop'
  ]);
  assert.deepEqual(catalog.products[0].media.map((item) => item.type), [
    'image',
    'video',
    'image',
    'image',
    'image'
  ]);
  assert.equal(catalog.legacy.currentDrop.pagePath, 'products/limited-drop');
  assert.equal(catalog.legacy.currentDrop.shopVisible, true);
  assert.equal(
    catalog.legacy.currentDrop.description,
    'Limited time! HEARTLANDER JIG Jewel Baits 5/8 PeeWee Football HD Premium skirt, Boss skirt collar, custom Stardust Painted jighead!!!'
  );
  assert.equal(
    catalog.legacy.currentDrop.variants[0].id,
    'gid://shopify/ProductVariant/51000785633447'
  );
});

test('loadFreshCatalog follows product, variant, and media cursors before normalization', async () => {
  const first = fixtureProduct();
  first.options[0].optionValues.push({
    id: 'gid://shopify/ProductOptionValue/310',
    name: 'Green'
  });
  first.variants.pageInfo = { hasNextPage: true, endCursor: 'variant-page-1' };
  first.media.pageInfo = { hasNextPage: true, endCursor: 'media-page-1' };
  const second = fixtureProduct({
    id: 'gid://shopify/Product/111',
    handle: 'second-page-product',
    title: 'Second Page Product'
  });
  second.variants.nodes = [{
    ...second.variants.nodes[0],
    id: 'gid://shopify/ProductVariant/408'
  }];
  const calls = [];

  async function requester(query, variables) {
    calls.push({ query, variables });
    if (query.includes('BassBingeProductVariantsPage')) {
      return {
        product: {
          id: first.id,
          variants: {
            nodes: [{
              ...first.variants.nodes[0],
              id: 'gid://shopify/ProductVariant/409',
              title: 'Green',
              selectedOptions: [{ name: 'Color', value: 'Green' }]
            }],
            pageInfo: { hasNextPage: false, endCursor: 'variant-page-2' }
          }
        }
      };
    }
    if (query.includes('BassBingeProductMediaPage')) {
      return {
        product: {
          id: first.id,
          media: {
            nodes: [{
              __typename: 'MediaImage',
              id: 'gid://shopify/MediaImage/503',
              alt: 'Back view',
              image: {
                url: 'https://cdn.shopify.com/back.jpg',
                altText: 'Back view',
                width: 1200,
                height: 1200
              }
            }],
            pageInfo: { hasNextPage: false, endCursor: 'media-page-2' }
          }
        }
      };
    }
    if (variables.after === 'product-1') {
      return {
        products: {
          edges: [{ cursor: 'product-2', node: second }],
          pageInfo: { hasNextPage: false, endCursor: 'product-2' }
        }
      };
    }
    return {
      products: {
        edges: [{ cursor: 'product-1', node: first }],
        pageInfo: { hasNextPage: true, endCursor: 'product-1' }
      }
    };
  }

  const envelope = await loadFreshCatalog({ headers: {} }, {
    authenticated: false,
    storefrontRequest: requester,
    generatedAt: '2026-07-26T13:00:00.000Z',
    requestId: 'pagination-fixture'
  });

  assert.equal(calls.length, 4);
  assert.equal(envelope.products.length, 2);
  assert.equal(envelope.products[0].variants.length, 3);
  assert.equal(envelope.products[0].media.length, 2);
  assert.equal(envelope.products[1].handle, 'second-page-product');
  assert.equal(envelope.requestId, 'pagination-fixture');
});
