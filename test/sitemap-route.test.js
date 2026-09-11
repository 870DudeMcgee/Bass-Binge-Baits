'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderSitemap, createSitemapHandler } = require('../lib/sitemap-route.js');
const { renderGenericProductPage } = require('../lib/generic-product-route.js');

function response() {
  return { headers: {}, setHeader(k,v) {this.headers[k] = v;}, status(code) {this.code=code;return this;}, send(body) {this.body=body;return this;} };
}
test('sitemap follows admitted products including sold-out items, excludes hidden add-ons, and deduplicates', () => {
  const xml=renderSitemap({schemaVersion:2, products:[
    {handle:'new-product',availableForSale:false,media:[{type:'image',image:{url:'https://cdn.example/front?a=1&b=2'}},{type:'image',image:{url:'data:image/png;base64,unsafe'}},{type:'video',image:{url:'https://cdn.example/not-an-image.jpg'}}],variants:[{image:{url:'https://cdn.example/variant-only.jpg'}}]},
    {handle:'new-product',media:[{type:'image',image:{url:'https://cdn.example/front?a=1&b=2'}}],variants:[{image:{url:'https://cdn.example/variant-only.jpg'}}]},
    {handle:'rattle',presentation:{kind:'hidden-add-on'},media:[{type:'image',image:{url:'https://cdn.example/hidden.jpg'}}]},
  ]});
  assert.equal((xml.match(/<loc>/g)||[]).length,7);
  assert.match(xml,/products\/new-product/);
  assert.match(xml,/https:\/\/www\.bassbingebaits\.com\/returns/);
  assert.match(xml,/xmlns:image="http:\/\/www\.google\.com\/schemas\/sitemap-image\/1\.1"/);
  assert.match(xml,/<image:loc>https:\/\/cdn\.example\/front\?a=1&amp;b=2<\/image:loc>/);
  assert.match(xml,/<image:loc>https:\/\/cdn\.example\/variant-only\.jpg<\/image:loc>/);
  assert.equal((xml.match(/variant-only\.jpg/g)||[]).length,1);
  assert.equal((xml.match(/front\?a=1&amp;b=2/g)||[]).length,1);
  assert.doesNotMatch(xml,/rattle|hidden\.jpg|not-an-image|base64|lastmod/);
});
test('catalog errors fail with retryable 503 rather than a successful empty sitemap', async () => {
  for(const getCatalog of [async()=>{throw Error('offline');},async()=>null]) {
    const res=response();await createSitemapHandler({getCatalog})({method:'GET'},res);
    assert.equal(res.code,503);assert.equal(res.headers['Cache-Control'],'no-store');assert.equal(res.headers['Retry-After'],'300');
  }
});
test('sitemap supports HEAD and disallows mutation methods', async () => {
  const handler=createSitemapHandler({getCatalog:async()=>({schemaVersion:2,products:[]})});
  const head=response();await handler({method:'HEAD'},head);assert.equal(head.code,200);assert.equal(head.body,'');
  const post=response();await handler({method:'POST'},post);assert.equal(post.code,405);
});
test('product details and real image are visible before scripts; purchases await admission', () => {
  const html=renderGenericProductPage({handle:'new-jig',title:'New Jig',descriptionHtml:'<p>Actual description</p>',media:[{type:'image',image:{url:'https://example.com/jig.jpg'},alt:'Jig'}]});
  assert.match(html,/<main class="product-page">/);assert.match(html,/src="https:\/\/example.com\/jig.jpg" alt="Jig"/);assert.match(html,/data-add-cart disabled/);assert.match(html,/Actual description/);
});

test('all seven established products retain editorial details with live variant controls', () => {
  const editorial = require('../lib/product-editorial.js');
  assert.equal(Object.keys(editorial).length,7);
  for (const [handle,copy] of Object.entries(editorial)) {
    const html=renderGenericProductPage({handle,title:handle,descriptionHtml:'Live Shopify copy'});
    assert.ok(copy.details.includes('Product Details'),handle);
    assert.ok(html.includes(copy.details),handle);
    assert.ok(html.includes(copy.specs),handle);
    assert.match(html,/data-generic-options/);
    assert.doesNotMatch(html,/\d+ published|seven published|three weights|Three weights|Available in 3 sizes|Shopify inventory/);
  }
});
