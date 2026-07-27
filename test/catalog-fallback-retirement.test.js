'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { loadFreshCatalog } = require('../lib/shopify-catalog.js');

const root = path.resolve(__dirname, '..');

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('an admitted empty Shopify generation cannot repopulate local products', async () => {
  const envelope = await loadFreshCatalog({ headers: {} }, {
    authenticated: false,
    generatedAt: '2026-07-26T18:00:00.000Z',
    generationId: 'generation-empty',
    requestId: 'request-empty',
    logger: { warn() {} },
    storefrontRequest: async () => ({
      products: {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: null }
      }
    })
  });

  assert.deepEqual(envelope.products, []);
  assert.deepEqual(envelope.legacy.products, []);
  assert.equal(envelope.legacy.currentDrop, null);
});

test('commerce consumers contain no executable browser or server catalog fallback path', () => {
  const browserCatalog = source('assets/js/catalog.js');
  const productPage = source('assets/js/product-page.js');
  const serverCatalog = source('lib/shopify-catalog.js');

  assert.match(browserCatalog, /var PRODUCTS = \[\];/);
  assert.doesNotMatch(browserCatalog, /source:\s*['"]fallback['"]/);
  assert.doesNotMatch(browserCatalog, /catalog_fallback/);
  assert.doesNotMatch(productPage, /legacyColors|legacyWeights|legacyRattleOptions/);
  assert.doesNotMatch(productPage, /dataset\.(?:colors|colorImages|weights|basePrice|productName)/);
  assert.doesNotMatch(serverCatalog, /fallbackCatalog|normalizeKnownProduct|normalizeLegacyHeartlander/);
  assert.doesNotMatch(serverCatalog, /require\(['"]\.\.\/assets\/js\/catalog\.js['"]\)/);
});

test('static commerce markup stays hidden until the admitted catalog projection renders', () => {
  assert.match(
    source('shop.html'),
    /class="card-grid shop-grid shop-product-grid" hidden/
  );
  assert.match(
    source('index.html'),
    /data-limited-drop-card hidden/
  );

  for (const filename of fs.readdirSync(path.join(root, 'products'))) {
    if (!filename.endsWith('.html')) continue;
    assert.match(
      source(path.join('products', filename)),
      /<main class="product-page" hidden>/,
      filename
    );
  }
});

test('admitted shop cards render visibly when they are created after page initialization', () => {
  const shop = source('assets/js/shop.js');

  assert.match(shop, /card\.className = 'product-card';/);
  assert.doesNotMatch(shop, /card\.className = 'product-card reveal';/);
});

test('shop cards start unselected on the all-colors image and synchronize an explicit color choice', () => {
  const shop = source('assets/js/shop.js');

  assert.match(shop, /if \(!select\.value\) return null;/);
  assert.match(shop, /placeholderOption\.textContent = 'Choose a color';/);
  assert.match(shop, /color \? color\.image : product\.featuredImage/);
  assert.match(shop, /swatch\.setAttribute\('aria-pressed', 'false'\)/);
  assert.match(shop, /select\.value = swatch\.dataset\.colorKey;/);
  assert.match(shop, /addButton\.textContent = !color[\s\S]*'Choose a Color'/);
});
