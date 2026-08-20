'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const taxonomy = require('../assets/js/catalog-taxonomy.js');
const { createShopTaxonomyControls } = require('../assets/js/shop-taxonomy-controls.js');
const shopHtml = fs.readFileSync(path.resolve(__dirname, '..', 'shop.html'), 'utf8');

class FakeButton {
  constructor(dataset) {
    this.dataset = dataset;
    this.hidden = false;
    this.attributes = {};
    this.listeners = {};
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  click() {
    this.listeners.click();
  }
}

function makeHarness() {
  const departments = [
    new FakeButton({ shopDepartment: 'fishing' }),
    new FakeButton({ shopDepartment: 'lifestyle-and-gear' })
  ];
  const subcategories = [
    ['fishing', 'jigs'],
    ['fishing', 'trailers'],
    ['lifestyle-and-gear', 'apparel'],
    ['lifestyle-and-gear', 'headwear'],
    ['lifestyle-and-gear', 'drinkware'],
    ['lifestyle-and-gear', 'bags'],
    ['lifestyle-and-gear', 'accessories']
  ].map(([shopDepartment, shopSubcategory]) => new FakeButton({ shopDepartment, shopSubcategory }));
  const subcategoryGroup = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
  const document = {
    body: { dataset: {} },
    querySelector(selector) {
      return selector === '[data-shop-subcategory-controls]' ? subcategoryGroup : null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-shop-department]') return departments.concat(subcategories);
      if (selector === '[data-shop-department-button]') return departments;
      if (selector === '[data-shop-subcategory]') return subcategories;
      return [];
    }
  };

  return { document, departments, subcategories, subcategoryGroup };
}

test('department and subcategory buttons filter products on the same shop view', () => {
  const harness = makeHarness();
  let changes = 0;
  const controls = createShopTaxonomyControls({
    document: harness.document,
    taxonomy,
    onChange() { changes += 1; }
  });

  assert.deepEqual(controls.getSelection(), { department: 'fishing', subcategory: null });
  assert.deepEqual(
    harness.subcategories.filter((button) => !button.hidden).map((button) => button.dataset.shopSubcategory),
    ['jigs', 'trailers']
  );
  assert.equal(controls.matchesProduct({ productType: 'Jig' }), true);
  assert.equal(controls.matchesProduct({ productType: 'Headwear' }), false);

  harness.departments[1].click();

  assert.deepEqual(controls.getSelection(), { department: 'lifestyle-and-gear', subcategory: null });
  assert.deepEqual(
    harness.subcategories.filter((button) => !button.hidden).map((button) => button.dataset.shopSubcategory),
    ['apparel', 'headwear', 'drinkware', 'bags', 'accessories']
  );
  assert.equal(controls.matchesProduct({ productType: 'Jig' }), false);
  assert.equal(controls.matchesProduct({ productType: 'Headwear' }), true);

  const headwear = harness.subcategories.find((button) => button.dataset.shopSubcategory === 'headwear');
  headwear.click();

  assert.deepEqual(controls.getSelection(), { department: 'lifestyle-and-gear', subcategory: 'headwear' });
  assert.equal(headwear.attributes['aria-pressed'], 'true');
  assert.equal(controls.matchesProduct({ productType: 'Apparel' }), false);
  assert.equal(controls.matchesProduct({ productType: 'Headwear' }), true);
  assert.equal(changes, 2);
});

test('shop markup keeps one main Shop link and exposes exactly the approved controls', () => {
  const mainNavigation = shopHtml.match(/<nav class="nav-links"[\s\S]*?<\/nav>/)[0];
  const departmentValues = Array.from(
    shopHtml.matchAll(/data-shop-department-button data-shop-department="([^"]+)"/g),
    (match) => match[1]
  );
  const subcategoryValues = Array.from(
    shopHtml.matchAll(/data-shop-subcategory="([^"]+)"/g),
    (match) => match[1]
  );

  assert.equal((mainNavigation.match(/href="\/shop"/g) || []).length, 1);
  assert.deepEqual(departmentValues, ['fishing', 'lifestyle-and-gear']);
  assert.deepEqual(
    subcategoryValues,
    ['jigs', 'trailers', 'apparel', 'headwear', 'drinkware', 'bags', 'accessories']
  );
  assert.doesNotMatch(shopHtml, /data-shop-category-link/);
  assert.match(
    shopHtml,
    /catalog-taxonomy\.js[^]*shop-taxonomy-controls\.js[^]*shop\.js/
  );
});
