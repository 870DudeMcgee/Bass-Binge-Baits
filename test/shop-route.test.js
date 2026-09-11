'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { renderShopPage, createShopHandler } = require('../lib/shop-route');
const product = {handle:'test-mug',title:'Mug <&> $&',media:[{id:'image',type:'image',image:{url:'https://cdn.example/mug?a=1&b=2'},alt:'"Mug"'}]};
const catalog = products => ({schemaVersion:2,products});
function response() { return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},send(body){this.body=body;return this;}}; }
test('initial HTML has exactly one visible card, canonical link, escaped title and real image per public product', () => {
 const html=renderShopPage(catalog([product,{...product,handle:'hidden',presentation:{kind:'hidden-add-on'}}]));
 assert.match(html, /class="card-grid shop-grid shop-product-grid">/);
 assert.equal((html.match(/data-server-product=/g)||[]).length,1);
 assert.match(html,/href="\/products\/test-mug"/);
 assert.match(html,/Mug &lt;&amp;&gt; \$&amp;/);
 assert.match(html,/src="https:\/\/cdn.example\/mug\?a=1&amp;b=2"/);
 assert.doesNotMatch(html,/\/products\/hidden|SHOP_PRODUCT_CARDS|data-server-product="hidden"/);
});
test('rejects missing, malformed, duplicate or empty public catalog instead of publishing partial discovery', () => {
 for(const value of [null,{},catalog([]),catalog([null]),catalog([product,product]),catalog([{...product,handle:'../bad'}]),catalog([{...product,title:''}]),catalog([{...product,media:[]}]),catalog([{...product,media:[{type:'image',image:{url:'javascript:alert(1)'}}]}])]) assert.throws(()=>renderShopPage(value));
});
test('GET/HEAD succeed; failed catalogs give retryable 503/no-store; unsupported methods never load catalog', async () => {
 for(const method of ['GET','HEAD']) {
  const res=response();await createShopHandler({getCatalog:async()=>catalog([product])})({method},res);
  assert.equal(res.statusCode,200);assert.equal(res.headers['Content-Type'],'text/html; charset=utf-8');
  if(method==='HEAD')assert.equal(res.body,'');else assert.match(res.body,/data-server-product=/);
  for(const getCatalog of [async()=>null,async()=>{throw Error('upstream secret must not leak');}]) {
   const failed=response();await createShopHandler({getCatalog})({method},failed);
   assert.equal(failed.statusCode,503);assert.equal(failed.headers['Cache-Control'],'no-store');assert.equal(failed.headers['Retry-After'],'300');
   assert.doesNotMatch(failed.body,/secret/);if(method==='HEAD')assert.equal(failed.body,'');
  }
 }
 const res=response();await createShopHandler({getCatalog:()=>{throw Error('must not call');}})({method:'POST'},res);
 assert.equal(res.statusCode,405);assert.equal(res.headers.Allow,'GET, HEAD');
});
test('shop/category rewrites share the catalog handler and existing hydration owns filters/cart', () => {
 const config=require('../vercel.json');
 for(const source of ['/shop','/shop/:category(jigs|trailers|apparel)'])assert.ok(config.rewrites.some(r=>r.source===source&&r.destination==='/api/shop'));
 const js=fs.readFileSync(require.resolve('../assets/js/shop.js'),'utf8');
 assert.match(js,/grid.textContent = ''/);assert.match(js,/Promise.resolve\(catalog.ready\).then\(init\)/);
 const html=renderShopPage(catalog([product]));assert.match(html,/data-cart-open/);assert.match(html,/shop-taxonomy-controls.js/);
});

test('no static shop file shadows the dynamic rewrite', () => {
 const path=require('node:path');
 for(const name of ['shop.html','shop/index.html','shop']) assert.equal(fs.existsSync(path.join(__dirname,'..',name)),false,name);
});

test('every public product in the September 11 live catalog has its own initial HTML link and image', () => {
 const snapshot=require('./fixtures/shop-discovery-20260911.json');
 const products=snapshot.products.filter(p=>p.presentation.kind!=='hidden-add-on');
 const html=renderShopPage(snapshot);
 assert.equal(products.length,44);
 assert.equal((html.match(/data-server-product=/g)||[]).length,44);
 for(const p of products) {
  assert.equal(html.split('href="/products/'+p.handle+'"').length-1,1,p.handle);
  const card=html.split('data-server-product="'+p.handle+'"')[1].split('</article>')[0];
  assert.match(card,/<img src="https:\/\//,p.handle);
 }
 for(const p of snapshot.products.filter(p=>p.presentation.kind==='hidden-add-on')) assert.ok(!html.includes('/products/'+p.handle));
});
