'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const renderer = require('../assets/js/generic-product-page.js');

const craw = {
  handle: 'chopped-craw-6-pack',
  title: 'Chopped Craw (6 pack)',
  options: [{
    name: 'Color',
    values: [{ name: 'Green Pumpkin' }, { name: 'PBJ' }]
  }],
  media: [],
  variants: [
    {
      id: 'gid://shopify/ProductVariant/1001',
      selectedOptions: [{ name: 'Color', value: 'Green Pumpkin' }],
      price: { amount: '3.5', currencyCode: 'USD' },
      availableForSale: true
    },
    {
      id: 'gid://shopify/ProductVariant/1002',
      selectedOptions: [{ name: 'Color', value: 'PBJ' }],
      price: { amount: '3.5', currencyCode: 'USD' },
      availableForSale: true
    }
  ]
};

test('a color-only product resolves an exact Shopify variant without a fake jig weight', () => {
  assert.deepEqual(renderer.initialSelection(craw), { Color: 'Green Pumpkin' });
  assert.equal(
    renderer.resolveVariant(craw, { Color: 'PBJ' }).id,
    'gid://shopify/ProductVariant/1002'
  );
});

test('a color-only product cart line preserves exact Shopify identity and money', () => {
  const variant = renderer.resolveVariant(craw, { Color: 'PBJ' });

  assert.deepEqual(renderer.buildCartLine(craw, variant), {
    id: 'gid://shopify/ProductVariant/1002',
    productKey: 'chopped-craw-6-pack',
    productTitle: 'Chopped Craw (6 pack)',
    selectedOptions: [{ name: 'Color', value: 'PBJ' }],
    price: { amount: '3.5', currencyCode: 'USD' },
    image: null,
    checkoutMapping: {
      merchandiseId: 'gid://shopify/ProductVariant/1002',
      price: { amount: '3.5', currencyCode: 'USD' }
    },
    isCheckoutable: true
  });
});

test('generic jig builds use the Shopify handle when no legacy key exists', () => {
  assert.equal(
    renderer.catalogProductKey({ handle: '7-16-oz-pee-wee-flip' }),
    '7-16-oz-pee-wee-flip'
  );
  assert.equal(
    renderer.catalogProductKey({ key: 'legacy-key', handle: 'shopify-handle' }),
    'legacy-key'
  );
});

test('rattle price label formatting tolerates numeric and non-numeric deltas', () => {
  assert.equal(renderer.formatRattlePriceLabel('No', null), 'No');
  assert.equal(renderer.formatRattlePriceLabel('Yes', 0.75), 'Yes (+ $0.75)');
  assert.equal(renderer.formatRattlePriceLabel('Yes', '1.5'), 'Yes (+ $1.50)');
  assert.equal(renderer.formatRattlePriceLabel('Yes', 'not-a-number'), 'Yes');
});

test('generic rendering waits for catalog readiness before mounting rattle controls', async () => {
  let resolveCatalog;
  let mountCalls = 0;
  const catalogReady = new Promise((resolve) => {
    resolveCatalog = resolve;
  });
  const mounted = renderer.afterReady(catalogReady, () => {
    mountCalls += 1;
  });

  await Promise.resolve();
  assert.equal(mountCalls, 0);

  resolveCatalog();
  await mounted;
  assert.equal(mountCalls, 1);
});

test('arbitrary option names resolve exact tuples without assuming jig fields', () => {
  const product = {
    handle: 'utility-box',
    title: 'Utility Box',
    options: [
      { name: 'Style', values: [{ name: 'Shallow' }, { name: 'Deep' }] },
      { name: 'Size', values: [{ name: 'Small' }, { name: 'Large' }] }
    ],
    variants: [
      {
        id: 'gid://shopify/ProductVariant/2001',
        selectedOptions: [
          { name: 'Style', value: 'Shallow' },
          { name: 'Size', value: 'Small' }
        ],
        price: { amount: '8.00', currencyCode: 'USD' },
        availableForSale: true
      },
      {
        id: 'gid://shopify/ProductVariant/2002',
        selectedOptions: [
          { name: 'Style', value: 'Deep' },
          { name: 'Size', value: 'Large' }
        ],
        price: { amount: '10.00', currencyCode: 'USD' },
        availableForSale: true
      }
    ]
  };

  assert.equal(
    renderer.resolveVariant(product, { Style: 'Deep', Size: 'Large' }).id,
    'gid://shopify/ProductVariant/2002'
  );
  assert.deepEqual(
    renderer.optionValueState(product, { Style: 'Shallow', Size: 'Small' }, 'Style', 'Deep'),
    { exists: true, available: true }
  );
});

function mediaDocument() {
  return { createElement(tag) {
    return { tagName:tag.toUpperCase(), events:{}, setAttribute(key,value) {this[key]=value;}, addEventListener(key,fn) {this.events[key]=fn;}, replaceWith(node) {this.replacement=node;} };
  }};
}

test('Shopify videos render controls with an MP4 source and a non-image thumbnail', () => {
  const item={type:'video',sources:[{url:'https://example.com/video.m3u8',format:'m3u8'},{url:'https://example.com/video.mp4',mimeType:'video/mp4'}]};
  const doc=mediaDocument();
  const video=renderer.galleryMediaNode(doc,item,'Heartlander',false);
  assert.equal(video.tagName,'VIDEO');assert.equal(video.src,'https://example.com/video.mp4');
  assert.equal(video.controls,true);assert.equal(video.playsInline,true);assert.equal(video.preload,'metadata');
  const thumbnail=renderer.galleryMediaNode(doc,item,'Heartlander',true);
  assert.equal(thumbnail.tagName,'SPAN');assert.equal(thumbnail.textContent,'▶ Video');assert.equal(thumbnail.src,undefined);
});

test('failed image thumbnails get readable fallback and absent media never gets empty image src', () => {
  const doc=mediaDocument();
  const image=renderer.galleryMediaNode(doc,{type:'image',image:{url:'https://example.com/missing.jpg'}},'Jig',true);
  image.events.error();assert.equal(image.replacement.textContent,'Image');
  const missing=renderer.galleryMediaNode(doc,{type:'video',sources:[]},'Jig',false);
  assert.equal(missing.tagName,'SPAN');assert.equal(missing.src,undefined);
});
