'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeDiscoveredProduct } = require('../lib/shopify-catalog.js');

test('known Shopify products retain the established page route, swatches, and assigned color images', () => {
  const product = {
    handle: '5-16-oz-finesse-jig',
    title: '5/16 oz. Finesse Jig +',
    descriptionHtml: '<p>Finesse jig.</p>',
    vendor: 'Bass Binge Baits',
    productType: 'Jig',
    updatedAt: '2026-07-27T12:00:00Z',
    featuredMediaId: 'gid://shopify/ProductImage/featured',
    media: [{
      id: 'gid://shopify/MediaImage/featured',
      type: 'image',
      alt: 'All colors',
      image: { id: 'gid://shopify/ImageSource/featured', url: 'all-colors.jpg' }
    }],
    options: [{
      name: 'Color',
      values: [
        { name: 'Blackberry Smoothie' },
        { name: 'Cool Breeze' }
      ]
    }],
    variants: [
      {
        id: 'gid://shopify/ProductVariant/1',
        title: 'Blackberry Smoothie',
        selectedOptions: [{ name: 'Color', value: 'Blackberry Smoothie' }],
        price: { amount: '5.00', currencyCode: 'USD' },
        availableForSale: true,
        imageId: 'gid://shopify/ProductImage/blackberry',
        image: { url: 'blackberry.jpg', alt: 'Blackberry Smoothie jig' }
      },
      {
        id: 'gid://shopify/ProductVariant/2',
        title: 'Cool Breeze',
        selectedOptions: [{ name: 'Color', value: 'Cool Breeze' }],
        price: { amount: '5.00', currencyCode: 'USD' },
        availableForSale: true,
        imageId: 'gid://shopify/ProductImage/cool-breeze',
        image: { url: 'cool-breeze.jpg', alt: 'Cool Breeze jig' }
      }
    ]
  };

  const projected = normalizeDiscoveredProduct(product);

  assert.equal(projected.key, 'finesse-jig');
  assert.equal(projected.pagePath, 'products/finesse-jig');
  assert.equal(projected.detailOnly, false);
  assert.deepEqual(projected.weights, [{ key: '5-16', label: '5/16', priceDelta: 0 }]);
  assert.deepEqual(
    projected.colors.map((color) => ({ name: color.name, swatch: color.swatch, image: color.image })),
    [
      { name: 'Blackberry Smoothie', swatch: '#2d1631', image: 'blackberry.jpg' },
      { name: 'Cool Breeze', swatch: '#4a7c8c', image: 'cool-breeze.jpg' }
    ]
  );
});

test('multi-weight Shopify option names containing colors keep exact live tuples', () => {
  const product = {
    handle: 'pee-wee-football',
    title: 'Pee Wee Football +',
    descriptionHtml: '',
    media: [{
      id: 'media',
      type: 'image',
      image: { id: 'image', url: 'blackberry.jpg' }
    }],
    options: [
      { name: 'Pee Wee + colors', values: [{ name: 'Blackberry Smoothie' }] },
      { name: 'Weight', values: [{ name: '3/16 oz' }, { name: '5/16 oz' }] }
    ],
    variants: [{
      id: 'gid://shopify/ProductVariant/3',
      title: 'Blackberry Smoothie / 3/16 oz',
      selectedOptions: [
        { name: 'Pee Wee + colors', value: 'Blackberry Smoothie' },
        { name: 'Weight', value: '3/16 oz' }
      ],
      price: { amount: '5.00', currencyCode: 'USD' },
      availableForSale: true,
      image: { url: 'blackberry.jpg' }
    }]
  };

  const projected = normalizeDiscoveredProduct(product);

  assert.equal(projected.key, 'pee-wee-football');
  assert.equal(projected.pagePath, 'products/pee-wee-football');
  assert.equal(projected.variants[0].colorKey, 'blackberry-smoothie');
  assert.equal(projected.variants[0].weightKey, '3-16-oz');
});
