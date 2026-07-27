'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const renderer = require('../assets/js/generic-product-page.js');

function variant(id, selectedOptions, amount, availableForSale, imageId) {
  return {
    id: `gid://shopify/ProductVariant/${id}`,
    title: selectedOptions.map((option) => option.value).join(' / ') || 'Default Title',
    selectedOptions,
    price: { amount, currencyCode: 'USD' },
    compareAtPrice: null,
    availableForSale,
    quantityAvailable: availableForSale ? 4 : 0,
    imageId: imageId || null
  };
}

function product(overrides) {
  return Object.assign({
    id: 'gid://shopify/Product/1',
    handle: 'generic-jig',
    title: 'Generic Jig',
    descriptionHtml: '',
    availableForSale: true,
    featuredMediaId: null,
    media: [],
    options: [],
    variants: [variant('1', [], '5.00', true)],
    presentation: { kind: 'ordinary' }
  }, overrides || {});
}

test('default variant resolves without inventing option names', () => {
  const current = product();

  assert.deepEqual(renderer.initialSelection(current), {});
  assert.equal(renderer.resolveVariant(current, {}).id, 'gid://shopify/ProductVariant/1');
});

test('Color-only and Weight-only products resolve exact Shopify option tuples', () => {
  const colorOnly = product({
    options: [{ id: 'color', name: 'Color', values: [{ id: 'black', name: 'Black' }, { id: 'blue', name: 'Blue' }] }],
    variants: [
      variant('11', [{ name: 'Color', value: 'Black' }], '5.00', true),
      variant('12', [{ name: 'Color', value: 'Blue' }], '5.25', false)
    ]
  });
  const weightOnly = product({
    options: [{ id: 'weight', name: 'Weight', values: [{ id: 'half', name: '1/2 oz' }] }],
    variants: [variant('21', [{ name: 'Weight', value: '1/2 oz' }], '5.50', true)]
  });

  assert.deepEqual(renderer.initialSelection(colorOnly), { Color: 'Black' });
  assert.equal(renderer.resolveVariant(colorOnly, { Color: 'Blue' }).id, 'gid://shopify/ProductVariant/12');
  assert.deepEqual(renderer.optionValueState(colorOnly, { Color: 'Black' }, 'Color', 'Blue'), {
    exists: true,
    available: false
  });
  assert.equal(renderer.resolveVariant(weightOnly, { Weight: '1/2 oz' }).id, 'gid://shopify/ProductVariant/21');
});

test('Style and Size selectors use the complete selection tuple', () => {
  const styleSize = product({
    options: [
      { id: 'style', name: 'Style', values: [{ id: 'football', name: 'Football' }, { id: 'arkie', name: 'Arkie' }] },
      { id: 'size', name: 'Size', values: [{ id: 'small', name: 'Small' }, { id: 'large', name: 'Large' }] }
    ],
    variants: [
      variant('31', [{ name: 'Style', value: 'Football' }, { name: 'Size', value: 'Small' }], '6.00', true),
      variant('32', [{ name: 'Style', value: 'Football' }, { name: 'Size', value: 'Large' }], '6.50', false),
      variant('33', [{ name: 'Style', value: 'Arkie' }, { name: 'Size', value: 'Small' }], '6.25', true)
    ]
  });

  assert.equal(
    renderer.resolveVariant(styleSize, { Style: 'Arkie', Size: 'Small' }).id,
    'gid://shopify/ProductVariant/33'
  );
  assert.equal(renderer.resolveVariant(styleSize, { Style: 'Arkie' }), null);
  assert.deepEqual(
    renderer.optionValueState(styleSize, { Style: 'Arkie', Size: 'Small' }, 'Size', 'Large'),
    { exists: true, available: false }
  );
});

test('exact option strings do not collide after punctuation, spacing, or Unicode normalization', () => {
  const collisionProduct = product({
    options: [{
      id: 'finish',
      name: 'Finish / Style',
      values: [
        { id: 'space', name: 'A B' },
        { id: 'punctuation', name: 'A-B' },
        { id: 'unicode', name: 'A B' },
        { id: 'accent', name: 'Café' },
        { id: 'plain', name: 'Cafe' }
      ]
    }],
    variants: [
      variant('61', [{ name: 'Finish / Style', value: 'A B' }], '6.00', true),
      variant('62', [{ name: 'Finish / Style', value: 'A-B' }], '6.10', true),
      variant('63', [{ name: 'Finish / Style', value: 'A B' }], '6.20', true),
      variant('64', [{ name: 'Finish / Style', value: 'Café' }], '6.30', true),
      variant('65', [{ name: 'Finish / Style', value: 'Cafe' }], '6.40', true)
    ]
  });

  assert.equal(
    renderer.resolveVariant(collisionProduct, { 'Finish / Style': 'A-B' }).id,
    'gid://shopify/ProductVariant/62'
  );
  assert.equal(
    renderer.resolveVariant(collisionProduct, { 'Finish / Style': 'A B' }).id,
    'gid://shopify/ProductVariant/63'
  );
  assert.equal(
    renderer.resolveVariant(collisionProduct, { 'Finish / Style': 'Café' }).id,
    'gid://shopify/ProductVariant/64'
  );
});

test('diagonal and disconnected matrices can transition to every available tuple', () => {
  const diagonal = product({
    options: [
      { id: 'style', name: 'Style', values: [{ id: 'football', name: 'Football' }, { id: 'arkie', name: 'Arkie' }] },
      { id: 'size', name: 'Size', values: [{ id: 'small', name: 'Small' }, { id: 'large', name: 'Large' }, { id: 'xl', name: 'XL' }] }
    ],
    variants: [
      variant('71', [{ name: 'Style', value: 'Football' }, { name: 'Size', value: 'Small' }], '6.00', true),
      variant('72', [{ name: 'Style', value: 'Arkie' }, { name: 'Size', value: 'Large' }], '6.50', true),
      variant('73', [{ name: 'Style', value: 'Arkie' }, { name: 'Size', value: 'XL' }], '6.75', false)
    ]
  });

  assert.deepEqual(
    renderer.optionValueState(diagonal, { Style: 'Football', Size: 'Small' }, 'Style', 'Arkie'),
    { exists: true, available: true }
  );
  assert.deepEqual(
    renderer.selectionForOptionValue(
      diagonal,
      { Style: 'Football', Size: 'Small' },
      'Style',
      'Arkie'
    ),
    { Style: 'Arkie', Size: 'Large' }
  );
  assert.deepEqual(
    renderer.optionValueState(diagonal, { Style: 'Football', Size: 'Small' }, 'Size', 'XL'),
    { exists: true, available: false }
  );
  assert.equal(
    renderer.resolveVariant(diagonal, { Style: 'Football', Size: 'Large' }),
    null
  );
});

test('three-option disconnected matrices retain shopper intent until the target tuple is reached', () => {
  const disconnected = product({
    options: [
      { id: 'a', name: 'A', values: [{ id: 'a0', name: '0' }, { id: 'a1', name: '1' }] },
      { id: 'b', name: 'B', values: [{ id: 'b0', name: '0' }, { id: 'b1', name: '1' }] },
      { id: 'c', name: 'C', values: [{ id: 'c0', name: '0' }, { id: 'c1', name: '1' }] }
    ],
    variants: [
      variant('81', [{ name: 'A', value: '1' }, { name: 'B', value: '0' }, { name: 'C', value: '0' }], '7.00', true),
      variant('82', [{ name: 'A', value: '0' }, { name: 'B', value: '1' }, { name: 'C', value: '0' }], '7.10', true),
      variant('83', [{ name: 'A', value: '0' }, { name: 'B', value: '0' }, { name: 'C', value: '1' }], '7.20', true),
      variant('84', [{ name: 'A', value: '1' }, { name: 'B', value: '1' }, { name: 'C', value: '1' }], '7.30', true)
    ]
  });

  assert.deepEqual(renderer.selectionForOptionIntent(disconnected, { A: '1' }), {
    A: '1', B: '0', C: '0'
  });
  assert.deepEqual(renderer.selectionForOptionIntent(disconnected, { A: '1', B: '1' }), {
    A: '1', B: '1', C: '1'
  });
  assert.equal(
    renderer.resolveVariant(
      disconnected,
      renderer.selectionForOptionIntent(disconnected, { A: '1', B: '1', C: '1' })
    ).id,
    'gid://shopify/ProductVariant/84'
  );
});

test('variant image leads the complete ordered media gallery', () => {
  const current = product({
    media: [
      { id: 'media-a', type: 'image', alt: 'Front', image: { url: 'front.jpg' } },
      { id: 'media-b', type: 'image', alt: 'Side', image: { id: 'image-b', url: 'side.jpg' } },
      { id: 'media-c', type: 'video', alt: 'Action', sources: [{ url: 'action.mp4', mimeType: 'video/mp4' }] }
    ]
  });

  assert.deepEqual(
    renderer.orderedMedia(current, { imageId: 'image-b' }).map((item) => item.id),
    ['media-b', 'media-a', 'media-c']
  );
  assert.deepEqual(
    renderer.orderedMedia(current, { imageId: 'missing' }).map((item) => item.id),
    ['media-a', 'media-b', 'media-c']
  );
});

test('missing media uses an accessible placeholder', () => {
  assert.deepEqual(renderer.mediaPresentation(null, 'Generic Jig'), {
    type: 'placeholder',
    label: 'Product image unavailable for Generic Jig'
  });
});

test('sold-out variants stay resolvable but cannot become cart lines', () => {
  const current = product({
    options: [{ id: 'color', name: 'Color', values: [{ id: 'blue', name: 'Blue' }] }],
    variants: [variant('42', [{ name: 'Color', value: 'Blue' }], '7.25', false)]
  });
  const selected = renderer.resolveVariant(current, { Color: 'Blue' });

  assert.equal(selected.availableForSale, false);
  assert.equal(renderer.buildCartLine(current, selected), null);
});

test('cart line preserves selected options, exact GID, and exact Shopify money', () => {
  const selected = variant(
    '51',
    [{ name: 'Style', value: 'Football' }, { name: 'Size', value: 'Small' }],
    '6.75',
    true,
    'media-b'
  );
  const current = product({ variants: [selected] });

  assert.deepEqual(renderer.buildCartLine(current, selected), {
    id: 'gid://shopify/ProductVariant/51',
    productKey: 'generic-jig',
    productTitle: 'Generic Jig',
    selectedOptions: [
      { name: 'Style', value: 'Football' },
      { name: 'Size', value: 'Small' }
    ],
    price: { amount: '6.75', currencyCode: 'USD' },
    image: null,
    checkoutMapping: {
      merchandiseId: 'gid://shopify/ProductVariant/51',
      price: { amount: '6.75', currencyCode: 'USD' }
    },
    isCheckoutable: true
  });
});
