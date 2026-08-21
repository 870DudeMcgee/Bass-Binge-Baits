'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const taxonomy = require('../assets/js/catalog-taxonomy.js');

test('maps every approved Shopify product type to its department and subcategory', () => {
  const cases = [
    ['Jig', 'fishing', 'jigs'],
    ['Trailer', 'fishing', 'trailers'],
    ['Apparel', 'lifestyle-and-gear', 'apparel'],
    ['Headwear', 'lifestyle-and-gear', 'headwear'],
    ['Drinkware', 'lifestyle-and-gear', 'drinkware'],
    ['Bag', 'lifestyle-and-gear', 'bags'],
    ['Accessory', 'lifestyle-and-gear', 'accessories']
  ];

  cases.forEach(([productType, department, subcategory]) => {
    const classification = taxonomy.classificationForProduct({
      title: 'Misleading Jig Hat Bottle',
      productType
    });
    assert.deepEqual(classification, { department, subcategory });
  });
});

test('classifies the current catalog while Shopify product types are migrated', () => {
  const currentProducts = {
    apparel: [
      'Bass Binge Hoodie',
      'Bass Binge Baits Hoodie',
      'Bass Binge Baits Premium Sweatshirt',
      'Lake Life classic tee',
      'Heavyweight Hooded Sweatshirt | Independent Trading Co. IND4000',
      'Retro 3/4 sleeve raglan shirt',
      'Retro Bass Binge Baits ringer t-shirt',
      "Women's Relaxed T-Shirt",
      'Short-Sleeve T-Shirt',
      'Hooded long-sleeve tee',
      'Bass Binge Baits windbreaker'
    ],
    headwear: [
      'Bass Binge Baits hat',
      'Bass Binge Baits Trucker Cap',
      'Retro Foam trucker hat',
      'Coastal Washed Cap',
      'Bass Binge Baits Embroidered Beanie',
      'Bass Binge Baits camo trucker hat'
    ],
    drinkware: [
      'Stainless steel water bottle',
      'Flip straw water bottle',
      'Stainless steel tumbler',
      'Can cooler',
      'Mug with Color Inside',
      'White glossy mug'
    ],
    bags: [
      'Lake Life Clear tote bag',
      'Bass Binge Baits Tote bag'
    ],
    accessories: ['Magnet', 'Mouse pad', 'Rattle Add-on'],
    trailers: ['Chopped Craw (6 pack)'],
    jigs: [
      '5/16 Pee Wee Flip',
      '7/16 oz. Pee Wee Flip',
      '5/8 oz. Heavy Cover Football',
      'Pee Wee Football +',
      '5/16 oz. Finesse Jig +',
      '5/8 oz PeeWee Football HD — Heartlander',
      '5/16 PeeWee Spider HD (finesse cut)',
      '7/16 oz. PeeWee Football Jig',
      '3/4 Heavy Cover Football Jig',
      '1/2 oz. PeeWee Football HD'
    ]
  };
  const classified = Object.entries(currentProducts).flatMap(([subcategory, titles]) =>
    titles.map((title) => ({ title, subcategory: taxonomy.subcategoryForProduct({ title }) }))
  );

  assert.equal(classified.length, 39);
  classified.forEach(({ title, subcategory }) => {
    const expected = Object.entries(currentProducts).find(([, titles]) => titles.includes(title))[0];
    assert.equal(subcategory, expected, title);
  });
});

test('uses Shopify standard taxonomy before marketing-title heuristics', () => {
  assert.deepEqual(taxonomy.classificationForProduct({
    title: 'Collector Vessel',
    shopifyCategory: {
      name: 'Coffee & Tea Cups',
      ancestors: [{ name: 'Drinkware' }, { name: 'Kitchen & Dining' }]
    }
  }), { department: 'lifestyle-and-gear', subcategory: 'drinkware' });
  assert.deepEqual(taxonomy.classificationForProduct({
    title: 'Coffee Cup Football Jig',
    shopifyCategory: { name: 'Artificial Fishing Jigs', ancestors: [] }
  }), { department: 'fishing', subcategory: 'jigs' });
  assert.deepEqual(taxonomy.classificationForProduct({
    title: 'Football Jig Mug',
    shopifyCategory: { name: 'Coffee & Tea Cups', ancestors: [{ name: 'Drinkware' }] }
  }), { department: 'lifestyle-and-gear', subcategory: 'drinkware' });
});

test('unknown sellable products never silently inherit jig-only presentation', () => {
  assert.deepEqual(
    taxonomy.classificationForProduct({ title: 'Bass Binge Thing' }),
    { department: 'lifestyle-and-gear', subcategory: 'accessories' }
  );
});

test('refines the live legacy apparel bucket into merchandise subcategories', () => {
  const cases = [
    ['bass-binge-hoodie', 'Bass Binge Hoodie', 'apparel'],
    ['bass-binge-baits-hat', 'Bass Binge Baits hat', 'headwear'],
    ['stainless-steel-water-bottle', 'Stainless steel water bottle', 'drinkware'],
    ['lake-life-clear-tote-bag', 'Lake Life Clear tote bag', 'bags'],
    ['magnet', 'Magnet', 'accessories']
  ];

  cases.forEach(([handle, title, expected]) => {
    assert.equal(
      taxonomy.subcategoryForProduct({ handle, title, category: 'apparel', productType: '', tags: [] }),
      expected,
      title
    );
  });
});

test('keeps legacy category consumers stable until the shop UI adopts departments', () => {
  assert.equal(taxonomy.categoryForProduct({ productType: 'Jig' }), 'jigs');
  assert.equal(taxonomy.categoryForProduct({ productType: 'Trailer' }), 'trailers');
  ['Apparel', 'Headwear', 'Drinkware', 'Bag', 'Accessory'].forEach((productType) => {
    assert.equal(taxonomy.categoryForProduct({ productType }), 'apparel');
  });
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
