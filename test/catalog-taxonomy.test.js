'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const taxonomy = require('../assets/js/catalog-taxonomy.js');

test('classifies the established catalog and tagged merchandise', () => {
  assert.equal(taxonomy.categoryForProduct({ title: 'PeeWee Football Jig' }), 'jigs');
  assert.equal(taxonomy.categoryForProduct({ handle: 'chopped-craw-6-pack' }), 'trailers');
  assert.equal(taxonomy.categoryForProduct({ title: 'Bass Binge Logo Tee', productType: 'Apparel' }), 'apparel');
  assert.equal(taxonomy.categoryForProduct({ title: 'Performance Hat', tags: ['category-apparel'] }), 'apparel');
  assert.equal(taxonomy.categoryForProduct({ title: 'Flip straw water bottle', productType: 'Accessories' }), 'apparel');
  assert.equal(taxonomy.categoryForProduct({ title: 'Magnet' }), 'apparel');
  assert.equal(taxonomy.categoryForProduct({ title: 'Mouse pad' }), 'apparel');
});

test('classifies new merchandise from Shopify taxonomy and common product wording', () => {
  assert.equal(taxonomy.categoryForProduct({ title: 'Bass Binge Mug' }), 'apparel');
  assert.equal(taxonomy.categoryForProduct({ title: 'Bass Binge Koozie' }), 'apparel');
  assert.equal(taxonomy.categoryForProduct({ title: 'Can cooler' }), 'apparel');
  assert.equal(taxonomy.categoryForProduct({ title: 'Lake Life Clear tote bag' }), 'apparel');
  assert.equal(taxonomy.categoryForProduct({
    title: 'Bass Binge Vessel',
    shopifyCategory: {
      name: 'Coffee & Tea Cups',
      ancestors: [{ name: 'Drinkware' }, { name: 'Kitchen & Dining' }]
    }
  }), 'apparel');
});

test('uses Shopify fishing taxonomy for products whose titles are not descriptive', () => {
  assert.equal(taxonomy.categoryForProduct({
    title: 'The Heartlander',
    shopifyCategory: {
      name: 'Artificial Fishing Jigs',
      ancestors: [{ name: 'Fishing Baits & Lures' }, { name: 'Fishing' }]
    }
  }), 'jigs');
  assert.equal(taxonomy.categoryForProduct({
    title: 'The Chopper',
    shopifyCategory: {
      name: 'Artificial Soft Plastic Baits',
      ancestors: [{ name: 'Fishing Baits & Lures' }, { name: 'Fishing' }]
    }
  }), 'trailers');
});

test('routes an otherwise unknown sellable product to general Apparel & Gear instead of Jigs', () => {
  assert.equal(taxonomy.categoryForProduct({ title: 'Bass Binge Thing' }), 'apparel');
});

test('Shopify taxonomy outranks conflicting words in a marketing title', () => {
  assert.equal(taxonomy.categoryForProduct({
    title: 'Coffee Cup Football Jig',
    shopifyCategory: { name: 'Artificial Fishing Jigs', ancestors: [] }
  }), 'jigs');
  assert.equal(taxonomy.categoryForProduct({
    title: 'Football Jig Mug',
    shopifyCategory: { name: 'Coffee & Tea Cups', ancestors: [{ name: 'Drinkware' }] }
  }), 'apparel');
});

test('merchandise terms use whole normalized words instead of substring collisions', () => {
  assert.equal(taxonomy.categoryForProduct({ title: 'Bottlecap Spinner Jig' }), 'jigs');
  assert.equal(taxonomy.categoryForProduct({ title: 'Escape Football Jig' }), 'jigs');
});

test('maps category shop paths without inventing unknown categories', () => {
  assert.equal(taxonomy.shopCategoryFromPath('/shop'), 'all');
  assert.equal(taxonomy.shopCategoryFromPath('/shop/jigs'), 'jigs');
  assert.equal(taxonomy.shopCategoryFromPath('/shop/trailers/'), 'trailers');
  assert.equal(taxonomy.shopCategoryFromPath('/shop/sale'), 'all');
});

test('prioritizes rig-building recommendations ahead of apparel', () => {
  const current = { handle: 'finesse-jig', title: 'Finesse Jig', category: 'jigs' };
  const products = [
    current,
    { handle: 'logo-tee', title: 'Logo Tee', category: 'apparel' },
    { handle: 'football-jig', title: 'Football Jig', category: 'jigs' },
    { handle: 'chopped-craw', title: 'Chopped Craw', category: 'trailers' }
  ];
  assert.deepEqual(
    taxonomy.relatedProducts(products, current, 3).map((product) => product.handle),
    ['chopped-craw', 'football-jig', 'logo-tee']
  );
});
