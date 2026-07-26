#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../assets/js/catalog.js');

const root = path.resolve(__dirname, '..');
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function reject(source, pattern, message) {
  if (pattern.test(source)) fail(message);
}

if (catalog.listProducts().length) {
  fail('Browser catalog exposes local products before a validated envelope arrives');
}
if (!catalog.status || catalog.status.source !== 'unavailable') {
  fail('Browser catalog does not begin in the explicit unavailable state');
}

const browserCatalog = read('assets/js/catalog.js');
const productPage = read('assets/js/product-page.js');
const serverCatalog = read('lib/shopify-catalog.js');
const shop = read('shop.html');
const home = read('index.html');

if (!/var PRODUCTS = \[\];/.test(browserCatalog)) {
  fail('assets/js/catalog.js does not begin with an empty admitted projection');
}
reject(browserCatalog, /source:\s*['"]fallback['"]/, 'assets/js/catalog.js still exposes a fallback source');
reject(browserCatalog, /catalog_fallback/, 'assets/js/catalog.js still reports catalog fallback behavior');
reject(productPage, /legacyColors|legacyWeights|legacyRattleOptions/, 'product-page.js still contains local option fallback');
reject(
  productPage,
  /dataset\.(?:colors|colorImages|weights|basePrice|productName)/,
  'product-page.js still reads local commerce facts from static data attributes'
);
reject(serverCatalog, /fallbackCatalog|normalizeKnownProduct|normalizeLegacyHeartlander/, 'Server catalog still contains a local catalog projection path');
reject(
  serverCatalog,
  /require\(['"]\.\.\/assets\/js\/catalog\.js['"]\)/,
  'Server catalog still imports the browser catalog as commerce authority'
);

if (!/class="card-grid shop-grid shop-product-grid" hidden/.test(shop)) {
  fail('Shop fallback cards are visible before live catalog admission');
}
if (!/data-limited-drop-card hidden/.test(home)) {
  fail('Homepage limited-drop commerce is visible before live catalog admission');
}

const productPages = fs.readdirSync(path.join(root, 'products'))
  .filter((filename) => filename.endsWith('.html'));
productPages.forEach((filename) => {
  const relativePath = path.join('products', filename);
  const html = read(relativePath);
  if (!/data-product-key=/.test(html)) {
    fail(`${relativePath} is missing data-product-key`);
  }
  if (!/<main class="product-page" hidden>/.test(html)) {
    fail(`${relativePath} exposes static commerce before catalog admission`);
  }
  ['data-colors', 'data-color-images', 'data-weights', 'data-rattle'].forEach((attribute) => {
    if (new RegExp(`${attribute}\\s*=`).test(html)) {
      fail(`${relativePath} still contains ${attribute}`);
    }
  });
  if (!html.includes('../assets/js/catalog.js')) {
    fail(`${relativePath} does not load catalog.js`);
  }
  if (!html.includes('../assets/js/product-page.js')) {
    fail(`${relativePath} does not load product-page.js`);
  }
});

if (failures.length) {
  console.error('Catalog validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Catalog validation passed: customer commerce requires an admitted CatalogEnvelope.');
