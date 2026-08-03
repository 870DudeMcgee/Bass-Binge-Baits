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
