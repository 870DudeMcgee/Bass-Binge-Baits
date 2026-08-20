'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const taxonomy = require('../assets/js/catalog-taxonomy.js');
const shopTaxonomyControls = require('../assets/js/shop-taxonomy-controls.js');
const {
  createShopFilterPanel,
  createShopRelevantFilters,
  createShopTaxonomyControls
} = shopTaxonomyControls;
const shopHtml = fs.readFileSync(path.resolve(__dirname, '..', 'shop.html'), 'utf8');
const shopJs = fs.readFileSync(path.resolve(__dirname, '..', 'assets/js/shop.js'), 'utf8');

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

  getAttribute(name) {
    return this.attributes[name] || null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  click() {
    this.listeners.click();
  }
}

function makeFilterPanelHarness() {
  const toggle = new FakeButton({});
  toggle.textContent = 'Filters';
  const panel = new FakeButton({});
  panel.id = 'shop-filter-panel';
  const shopTools = {
    classes: new Set(),
    classList: {
      toggle(name, force) {
        if (force) shopTools.classes.add(name);
        else shopTools.classes.delete(name);
      }
    }
  };
  const document = {
    listeners: {},
    querySelector(selector) {
      if (selector === '[data-shop-filters-toggle]') return toggle;
      if (selector === '[data-shop-filters-panel]') return panel;
      if (selector === '.shop-tools') return shopTools;
      return null;
    },
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }
  };

  return { document, panel, shopTools, toggle };
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

function makeRelevantFiltersHarness() {
  const controls = ['jig-profile', 'color', 'price', 'availability', 'size'].map((name) => ({
    dataset: { shopFilterControl: name },
    hidden: false
  }));
  const document = {
    querySelectorAll(selector) {
      return selector === '[data-shop-filter-control]' ? controls : [];
    }
  };

  return { controls, document };
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

test('active taxonomy exposes at most four relevant filters and resets hidden constraints', () => {
  const harness = makeRelevantFiltersHarness();
  const resets = [];
  const filters = createShopRelevantFilters({
    document: harness.document,
    onReset(name) { resets.push(name); }
  });

  const jigFilters = filters.sync(
    { department: 'fishing', subcategory: 'jigs' },
    [
      { hasColor: true, hasSize: false, price: 5, checkoutReady: true },
      { hasColor: true, hasSize: false, price: 10, checkoutReady: false }
    ]
  );

  assert.deepEqual(jigFilters, ['jig-profile', 'color', 'price', 'availability']);
  assert.equal(jigFilters.length <= 4, true);
  assert.equal(harness.controls.find((control) => control.dataset.shopFilterControl === 'size').hidden, true);
  assert.deepEqual(resets, ['size']);

  resets.length = 0;
  const apparelFilters = filters.sync(
    { department: 'lifestyle-and-gear', subcategory: 'apparel' },
    [
      { hasColor: true, hasSize: true, price: 25, checkoutReady: true },
      { hasColor: true, hasSize: true, price: 30, checkoutReady: true }
    ]
  );

  assert.deepEqual(apparelFilters, ['color', 'size']);
  assert.equal(apparelFilters.length <= 4, true);
  assert.deepEqual(resets, ['jig-profile', 'price', 'availability']);
});

test('Filters button exposes one accessible same-page panel', () => {
  const harness = makeFilterPanelHarness();
  createShopFilterPanel({ document: harness.document });

  assert.equal(harness.toggle.attributes['aria-controls'], 'shop-filter-panel');
  assert.equal(harness.toggle.attributes['aria-expanded'], 'false');
  assert.equal(harness.panel.attributes['aria-hidden'], 'true');
  assert.equal(harness.panel.attributes.inert, '');

  harness.toggle.click();

  assert.equal(harness.toggle.attributes['aria-expanded'], 'true');
  assert.equal(harness.toggle.textContent, 'Hide filters');
  assert.equal(harness.panel.attributes['aria-hidden'], 'false');
  assert.equal(harness.panel.attributes.inert, undefined);
  assert.equal(harness.shopTools.classes.has('filters-open'), true);

  harness.document.listeners.keydown({ key: 'Escape' });

  assert.equal(harness.toggle.attributes['aria-expanded'], 'false');
  assert.equal(harness.panel.attributes['aria-hidden'], 'true');
  assert.equal(harness.panel.attributes.inert, '');
  assert.equal(harness.shopTools.classes.has('filters-open'), false);
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
  assert.equal((shopHtml.match(/data-shop-filters-toggle/g) || []).length, 1);
  assert.equal((shopHtml.match(/data-shop-filters-panel/g) || []).length, 1);
  assert.match(shopHtml, /data-shop-filters-toggle[^>]*aria-controls="shop-filter-panel"/);
  assert.match(
    shopHtml,
    /id="shop-filter-panel"[^>]*data-shop-filters-panel[^>]*aria-hidden="true"[^>]*inert[^]*data-jig-filters[^]*shop-refiners/
  );
  assert.deepEqual(
    Array.from(shopHtml.matchAll(/data-shop-filter-control="([^"]+)"/g), (match) => match[1]),
    ['jig-profile', 'color', 'price', 'availability', 'size']
  );
  assert.match(
    shopHtml,
    /catalog-taxonomy\.js[^]*shop-taxonomy-controls\.js[^]*shop\.js/
  );
});

test('Chopped Craw shop cards reuse the established Jewel co-brand treatment', () => {
  assert.match(shopJs, /chopped-craw-6-pack/);
  assert.match(shopJs, /Jewell\? Baits/);
  assert.match(shopJs, /Jewel Bait Company/);
  assert.match(shopJs, /assets\/img\/jewel-bait-logo\.png/);
  assert.match(shopJs, /Jewel Finesse Craw/);
  assert.match(shopJs, /Made by Jewel Bait Company for finesse presentations/);
});
