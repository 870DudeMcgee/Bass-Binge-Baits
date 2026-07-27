'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const cartSource = fs.readFileSync(
  path.join(__dirname, '..', 'assets', 'js', 'cart-checkout.js'),
  'utf8'
);

function exactLine(id, overrides = {}) {
  return Object.assign({
    kind: 'shopify-variant',
    id,
    productKey: 'exact-jig',
    productTitle: 'Saved Exact Jig',
    selectedOptions: [{ name: 'Finish / Style', value: 'Café  ' }],
    price: { amount: '7.25', currencyCode: 'USD' },
    image: 'saved.jpg',
    checkoutMapping: {
      merchandiseId: id,
      price: { amount: '7.25', currencyCode: 'USD' }
    },
    quantity: 2,
    admittedGenerationId: 'generation-old'
  }, overrides);
}

function createHarness(savedLines, reconcile) {
  const storage = new Map([['bass-binge-cart-v2', JSON.stringify(savedLines)]]);
  const catalog = {
    store: {
      cartStorageKey: 'bass-binge-cart-v2',
      shopifyCartStorageKey: 'bass-binge-shopify-cart-v1'
    },
    status: { generationId: null },
    ready: null,
    reconcileExactCartLine: reconcile,
    getJigBuild() { return null; },
    listProducts() { return []; },
    formatMoney(value) { return '$' + Number(value || 0).toFixed(2); },
    assetPath(value) { return value; }
  };
  let resolveReady;
  catalog.ready = new Promise((resolve) => {
    resolveReady = () => {
      catalog.status.generationId = 'generation-current';
      resolve(catalog);
    };
  });
  const document = {
    body: { classList: { add() {}, remove() {} } },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    createElement() {
      return {
        classList: { add() {}, remove() {}, toggle() {} },
        dataset: {},
        appendChild() {},
        addEventListener() {},
        setAttribute() {}
      };
    }
  };
  const window = {
    BassBingeCatalog: catalog,
    document,
    localStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); }
    },
    location: { pathname: '/', assign() {} },
    setTimeout,
    clearTimeout,
    Promise
  };
  vm.runInNewContext(cartSource, {
    window,
    document,
    setTimeout,
    clearTimeout,
    Promise,
    console
  });
  return { window, storage, resolveReady };
}

test('persisted exact lines stay checkout-disabled until the current generation reconciles', async () => {
  const saved = exactLine('gid://shopify/ProductVariant/901');
  const current = exactLine(saved.id, {
    productTitle: 'Current Exact Jig',
    image: 'current.jpg',
    admittedGenerationId: 'generation-current'
  });
  const harness = createHarness([saved], () => ({ line: current, reason: null }));

  assert.equal(harness.window.BassBingeCart.getLines().length, 0);
  assert.equal(harness.window.BassBingeCart.buildCheckoutUrl(), null);

  harness.resolveReady();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.window.BassBingeCart.getLines().length, 1);
  assert.equal(harness.window.BassBingeCart.buildCheckoutUrl(), '#shopify-checkout');
  assert.equal(
    JSON.parse(harness.storage.get('bass-binge-cart-v2'))[0].admittedGenerationId,
    'generation-current'
  );
});

test('changed persisted exact lines are removed with a shopper-facing explanation', async () => {
  const removed = exactLine('gid://shopify/ProductVariant/902');
  const harness = createHarness([removed], () => ({
    line: null,
    reason: 'price-changed'
  }));

  harness.resolveReady();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(JSON.parse(harness.storage.get('bass-binge-cart-v2')), []);
  assert.equal(harness.window.BassBingeCart.getCount(), 0);
  assert.match(
    harness.window.BassBingeCart.getReconciliationNotice(),
    /price changed/i
  );
  assert.equal(harness.window.BassBingeCart.buildCheckoutUrl(), null);
});
