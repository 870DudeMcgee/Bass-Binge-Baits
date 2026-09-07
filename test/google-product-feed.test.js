'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderGoogleProductFeed, createGoogleProductFeedHandler } = require('../lib/google-product-feed.js');
const product = { id:'gid://shopify/Product/44', handle:'3-4-oz-football-jig', title:'Jig & Craw', descriptionHtml:'<p>Hand <strong>poured</strong> & tested\u0001.</p>', vendor:'Bass Binge', presentation:{kind:'ordinary'}, media:[{type:'image', image:{url:'https://cdn.example/jig?a=1&b=2'}}], options:[{name:'3/4 oz.'}], variants:[{id:'gid://shopify/ProductVariant/101', availableForSale:false, price:{amount:'5.50',currencyCode:'USD'}, selectedOptions:[{name:'3/4 oz.',value:'Green Pumpkin'}]}] };
function response() { return {headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},send(b){this.body=b;return this;}}; }
test('renders admitted variants with exact links, price, stock, custom color mapping, and XML escaping', () => { const xml=renderGoogleProductFeed({schemaVersion:2,products:[product]}); assert.match(xml,/<g:id>101<\/g:id>/); assert.match(xml,/<g:item_group_id>44<\/g:item_group_id>/); assert.match(xml,/products\/3-4-oz-football-jig\?variant=101/); assert.match(xml,/<g:price>5\.50 USD<\/g:price>/); assert.match(xml,/<g:availability>out_of_stock/); assert.match(xml,/<g:color>Green Pumpkin<\/g:color>/); assert.match(xml,/Jig &amp; Craw/); assert.doesNotMatch(xml,/\u0001/); });
test('excludes the hidden rattle add-on and returns 503 for an empty admitted catalog', async () => { const xml=renderGoogleProductFeed({schemaVersion:2,products:[product,{handle:'rattle',presentation:{kind:'hidden-add-on'},variants:[]}]}); assert.doesNotMatch(xml,/>rattle</); const old=console.error; console.error=()=>{}; const res=response(); await createGoogleProductFeedHandler({getCatalog:async()=>({schemaVersion:2,products:[]})})({method:'GET'},res); console.error=old; assert.equal(res.code,503); });
test('supports HEAD', async () => { const res=response(); await createGoogleProductFeedHandler({getCatalog:async()=>({schemaVersion:2,products:[product]})})({method:'HEAD'},res); assert.equal(res.code,200); assert.equal(res.body,''); });
test('uses explicit copy for otherwise unreviewed audiences', () => {
  const unisex = renderGoogleProductFeed({schemaVersion:2,products:[{...product, title:'Performance tee', descriptionHtml:'A unisex performance t-shirt.', variants:[{...product.variants[0], availableForSale:true, selectedOptions:[{name:'Color',value:'White'},{name:'Size',value:'M'}]}]}]});
  assert.match(unisex, /<g:gender>unisex<\/g:gender>/); assert.doesNotMatch(unisex, /<g:age_group>/);
  const womens = renderGoogleProductFeed({schemaVersion:2,products:[{...product, title:"Women's Relaxed T-Shirt", descriptionHtml:"A women's t-shirt.", variants:[{...product.variants[0], selectedOptions:[{name:'Color',value:'Black'},{name:'Size',value:'M'}]}]}]});
  assert.match(womens, /<g:gender>female<\/g:gender>/);
  const unknown = renderGoogleProductFeed({schemaVersion:2,products:[{...product, title:'Classic Hoodie', descriptionHtml:'A warm hoodie.'}]});
  assert.doesNotMatch(unknown, /<g:(?:gender|age_group)>/);
});
test('uses only explicit shipping profiles and preserves bait regions, rates, and delivery times', () => {
  const bait = renderGoogleProductFeed({schemaVersion:2,products:[{...product, handle:'5-16-pee-wee-flip'}]});
  assert.equal((bait.match(/<g:shipping>/g) || []).length, 50); assert.match(bait, /<g:region>DC<\/g:region>/); assert.doesNotMatch(bait, /<g:region>HI<\/g:region>/); assert.match(bait, /<g:price>8\.99 USD<\/g:price>/); assert.match(bait, /<g:min_handling_time>1<\/g:min_handling_time>[\s\S]*<g:max_transit_time>5<\/g:max_transit_time>/); assert.match(bait, /<g:free_shipping_threshold>[\s\S]*<g:price_threshold>50 USD/); assert.match(bait, /<g:shipping_handling_business_days>M-F/);
  const mug = renderGoogleProductFeed({schemaVersion:2,products:[{...product, handle:'white-glossy-mug', variants:[{...product.variants[0], selectedOptions:[{name:'Size',value:'15 oz'}]}]}]});
  assert.match(mug, /<g:price>7\.29 USD<\/g:price>/); assert.match(mug, /<g:min_handling_time>2<\/g:min_handling_time>[\s\S]*<g:max_transit_time>8<\/g:max_transit_time>/); assert.doesNotMatch(mug, /<g:region>/);
  const unknown = renderGoogleProductFeed({schemaVersion:2,products:[{...product, handle:'future-print-product'}]});
  assert.doesNotMatch(unknown, /<g:shipping>|<g:free_shipping_threshold>|shipping_handling_business_days/);
});

test('includes reviewed adult apparel audiences without classifying unknown products', () => {
  for (const [handle, gender] of [['premium-full-zip-hoodie', 'unisex'], ['womens-relaxed-t-shirt', 'female'], ['lake-life-bucket-hat', 'unisex'], ['tote-bag', 'unisex']]) {
    const feed = renderGoogleProductFeed({ schemaVersion: 2, products: [{ ...product, handle }] });
    assert.match(feed, /<g:age_group>adult<\/g:age_group>/);
    assert.ok(feed.includes(`<g:gender>${gender}</g:gender>`));
  }
  const feed = renderGoogleProductFeed({ schemaVersion: 2, products: [{ ...product, handle: 'future-shirt' }] });
  assert.doesNotMatch(feed, /<g:(?:age_group|gender)>/);
});

test('uses the actual T-shirt shipping profile for the heavyweight sweatshirt', () => {
  const feed = renderGoogleProductFeed({ schemaVersion: 2, products: [{ ...product, handle: 'heavyweight-hooded-sweatshirt-independent-trading-co-ind4000-2' }] });
  assert.match(feed, /<g:shipping>[\s\S]*?<g:price>4\.95 USD<\/g:price>/);
});
