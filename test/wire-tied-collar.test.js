'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const catalog = require('../assets/js/catalog.js');
const {normalizeCatalogEnvelope} = require('../lib/catalog-envelope.js');
const fixtures = require('./fixtures/catalog-envelope-v2.json');
function payload() {
  return {schemaVersion: 2, generationId: 'collar-test', products: [
    {handle: 'jig', presentation: {kind: 'ordinary', rattleEnabled: true}},
    {handle: 'shirt', presentation: {kind: 'ordinary', rattleEnabled: false}}
  ], legacy: {ok: true, products: ['jig', 'shirt'].map(handle => ({
    key: handle, handle, pagePath: 'products/' + handle, title: handle,
    defaultColorKey: 'black', colors: [{key: 'black', name: 'Black'}], weights: [],
    rattle: {available: true, defaultKey: 'no'},
    variants: [{id: 'gid://shopify/ProductVariant/1', colorKey: 'black', price: 5, money: {amount: '5.0', currencyCode: 'USD'}, available: true}]
  })), rattle: {merchandiseId: 'gid://shopify/ProductVariant/2', price: 1, available: true},
  collar: {merchandiseId: 'gid://shopify/ProductVariant/3', price: 2, currencyCode: 'USD', available: true}}};
}
test('independent choices charge $2 per jig and keep configurations distinct', () => {
  catalog.applyRemoteCatalog(payload());
  const builds = [];
  for (const rattleKey of ['no', 'yes']) for (const collarKey of ['no', 'yes']) {
    const build = catalog.getJigBuild({productKey: 'jig', rattleKey, collarKey});
    assert.equal(build.price, 5 + (rattleKey === 'yes' ? 1 : 0) + (collarKey === 'yes' ? 2 : 0));
    assert.equal(build.isCheckoutable, true);
    assert.equal(build.hasCollar, collarKey === 'yes');
    assert.equal(build.checkoutMapping.price, 5);
    assert.deepEqual(build.money, {amount: '5.0', currencyCode: 'USD'});
    builds.push(build);
  }
  assert.equal(new Set(builds.map(b => b.id)).size, 4);
  assert.equal(catalog.getJigBuild({productKey: 'shirt', collarKey: 'yes'}).isCheckoutable, false);
});
test('a saved collar choice cannot silently turn into a plain jig when unavailable', () => {
  for (const change of [p => p.legacy.collar = null, p => p.legacy.collar.available = false,
    p => p.legacy.collar.price = 3]) {
    const p = payload(); change(p); catalog.applyRemoteCatalog(p);
    const build = catalog.getJigBuild({productKey: 'jig', collarKey: 'yes'});
    assert.equal(build.hasCollar, true); assert.equal(build.isCheckoutable, false);
    assert.equal(catalog.getJigBuild({productKey: 'jig'}).isCheckoutable, true);
  }
});
test('collar is hidden from product browsing and cannot receive rattle controls itself', () => {
  const product = structuredClone(fixtures.colorOnly);
  product.handle = 'wire-tied-skirt-collar-add-on';
  product.productType = 'Wire-tied skirt collar add-on';
  const envelope = normalizeCatalogEnvelope([product]);
  assert.equal(envelope.products[0].presentation.kind, 'hidden-add-on');
  assert.equal(envelope.products[0].presentation.rattleEnabled, false);
});
