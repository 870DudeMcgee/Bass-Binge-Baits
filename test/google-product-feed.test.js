'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { renderGoogleProductFeed, createGoogleProductFeedHandler } = require('../lib/google-product-feed.js');
const { productStructuredData } = require('../lib/generic-product-route.js');
const { BAIT_HANDLES, BAIT_REGIONS, BUSINESS_DAYS, MUG_HANDLES, MUG_RATES, PRINTFUL_RATES } = require('../lib/product-policies.js');
const product = { id:'gid://shopify/Product/44', handle:'3-4-oz-football-jig', title:'Jig & Craw', descriptionHtml:'<p>Hand <strong>poured</strong> & tested\u0001.</p>', vendor:'Bass Binge', presentation:{kind:'ordinary'}, media:[{type:'image', image:{url:'https://cdn.example/jig?a=1&b=2'}}], options:[{name:'3/4 oz.'}], variants:[{id:'gid://shopify/ProductVariant/101', availableForSale:false, price:{amount:'5.50',currencyCode:'USD'}, selectedOptions:[{name:'3/4 oz.',value:'Green Pumpkin'}]}] };
function response() { return {headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},send(b){this.body=b;return this;}}; }
test('renders admitted variants with exact links, price, stock, custom color mapping, and XML escaping', () => { const xml=renderGoogleProductFeed({schemaVersion:2,products:[product]}); assert.match(xml,/<g:id>101<\/g:id>/); assert.match(xml,/<g:item_group_id>44<\/g:item_group_id>/); assert.match(xml,/products\/3-4-oz-football-jig\?variant=101/); assert.match(xml,/<g:price>5\.50 USD<\/g:price>/); assert.match(xml,/<g:availability>out_of_stock/); assert.match(xml,/<g:color>Green Pumpkin<\/g:color>/); assert.match(xml,/Jig &amp; Craw/); assert.doesNotMatch(xml,/\u0001/); });
test('adds at most ten real deduplicated catalog images and excludes each offer primary image', () => {
  const media = Array.from({length:12},(_,index)=>({type:'image',image:{url:`https://cdn.example/catalog-${index+1}.jpg?a=1&b=2`}}));
  media.push({type:'video',image:{url:'https://cdn.example/video-poster.jpg'}});
  media.push({type:'image',image:{url:'data:image/png;base64,unsafe'}});
  const variant = {...product.variants[0],image:{url:'https://cdn.example/variant-primary.jpg'}};
  const feed=renderGoogleProductFeed({schemaVersion:2,products:[{...product,media,variants:[variant,{...variant,id:'gid://shopify/ProductVariant/102',image:{url:'https://cdn.example/variant-only.jpg'}}]}]});
  const firstItem=feed.match(/<item>[\s\S]*?<\/item>/)[0];
  assert.match(firstItem,/<g:image_link>https:\/\/cdn\.example\/variant-primary\.jpg<\/g:image_link>/);
  assert.equal((firstItem.match(/<g:additional_image_link>/g)||[]).length,10);
  assert.doesNotMatch(firstItem,/<g:additional_image_link>https:\/\/cdn\.example\/variant-primary\.jpg/);
  assert.equal((firstItem.match(/catalog-1\.jpg/g)||[]).length,1);
  assert.match(firstItem,/catalog-1\.jpg\?a=1&amp;b=2/);
  assert.doesNotMatch(firstItem,/video-poster|base64|catalog-11|catalog-12/);

  const variantDiscovery=renderGoogleProductFeed({schemaVersion:2,products:[{...product,media:[media[0],media[0]],variants:[variant,{...variant,id:'gid://shopify/ProductVariant/102',image:{url:'https://cdn.example/variant-only.jpg'}}]}]});
  const variantDiscoveryFirstItem=variantDiscovery.match(/<item>[\s\S]*?<\/item>/)[0];
  assert.match(variantDiscoveryFirstItem,/<g:additional_image_link>https:\/\/cdn\.example\/variant-only\.jpg<\/g:additional_image_link>/);
  assert.equal((variantDiscoveryFirstItem.match(/catalog-1\.jpg/g)||[]).length,1);
});
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

function schemaOffer(candidate) {
  const canonical = `https://www.bassbingebaits.com/products/${candidate.handle}`;
  return productStructuredData(candidate, candidate.title, candidate.media[0], canonical).offers;
}

test('shared exact profiles keep feed and sold-out Offer schema shipping in parity', () => {
  for (const [handle, expectedPrice] of PRINTFUL_RATES) {
    const candidate = {...product,handle};
    const feed = renderGoogleProductFeed({schemaVersion:2,products:[candidate]});
    const details = schemaOffer(candidate).shippingDetails;
    assert.match(feed,new RegExp(`<g:price>${expectedPrice.replace('.', '\\.')} USD<\\/g:price>`),handle);
    assert.equal(details.shippingRate.value,expectedPrice,handle);
    assert.equal(details.shippingDestination.addressCountry,'US',handle);
    assert.deepEqual(details.deliveryTime.handlingTime,{ '@type':'QuantitativeValue',minValue:2,maxValue:5,unitCode:'DAY' },handle);
    assert.deepEqual(details.deliveryTime.transitTime,{ '@type':'QuantitativeValue',minValue:1,maxValue:8,unitCode:'DAY' },handle);
    assert.deepEqual(details.deliveryTime.businessDays.dayOfWeek,BUSINESS_DAYS,handle);
    assert.equal(schemaOffer(candidate).availability,'https://schema.org/OutOfStock',handle);
  }

  for (const handle of MUG_HANDLES) {
    for (const [size, expectedPrice] of Object.entries(MUG_RATES)) {
      const candidate = {...product,handle,variants:[{...product.variants[0],selectedOptions:[{name:'Size',value:size}]}]};
      const feed = renderGoogleProductFeed({schemaVersion:2,products:[candidate]});
      assert.match(feed,new RegExp(`<g:price>${expectedPrice.replace('.', '\\.')} USD<\\/g:price>`),`${handle} ${size}`);
      const details = schemaOffer(candidate).shippingDetails;
      assert.equal(details.shippingRate.value,expectedPrice,`${handle} ${size}`);
      assert.deepEqual(details.deliveryTime.handlingTime,{ '@type':'QuantitativeValue',minValue:2,maxValue:5,unitCode:'DAY' },`${handle} ${size}`);
      assert.deepEqual(details.deliveryTime.transitTime,{ '@type':'QuantitativeValue',minValue:1,maxValue:8,unitCode:'DAY' },`${handle} ${size}`);
    }
  }

  for (const handle of BAIT_HANDLES) {
    const candidate = {...product,handle};
    const feed = renderGoogleProductFeed({schemaVersion:2,products:[candidate]});
    const details = schemaOffer(candidate).shippingDetails;
    assert.equal((feed.match(/<g:shipping>/g)||[]).length,BAIT_REGIONS.length,handle);
    assert.deepEqual(details.shippingDestination.map(entry=>entry.addressRegion),BAIT_REGIONS,handle);
    assert.ok(details.shippingDestination.every(entry=>entry.addressCountry==='US'),handle);
    assert.equal(details.shippingRate.value,'8.99',handle);
    assert.deepEqual(details.deliveryTime.handlingTime,{ '@type':'QuantitativeValue',minValue:1,maxValue:3,unitCode:'DAY' },handle);
    assert.deepEqual(details.deliveryTime.transitTime,{ '@type':'QuantitativeValue',minValue:3,maxValue:5,unitCode:'DAY' },handle);
    assert.deepEqual(details.deliveryTime.businessDays.dayOfWeek,BUSINESS_DAYS,handle);
  }

  const returns = schemaOffer({...product,handle:'premium-full-zip-hoodie'}).hasMerchantReturnPolicy;
  assert.deepEqual(returns,{
    '@type':'MerchantReturnPolicy',applicableCountry:'US',itemCondition:'https://schema.org/NewCondition',
    returnPolicyCategory:'https://schema.org/MerchantReturnFiniteReturnWindow',merchantReturnDays:7,
    returnMethod:'https://schema.org/ReturnByMail',returnFees:'https://schema.org/ReturnFeesCustomerResponsibility',
    merchantReturnLink:'https://www.bassbingebaits.com/returns'
  });
  assert.equal(returns.restockingFee,undefined);
  assert.equal(returns.refundType,undefined);
});

test('bait schema applies the settled threshold only to one qualifying item', () => {
  const candidate = {...product,variants:[{...product.variants[0],price:{amount:'50.00',currencyCode:'USD'}}]};
  const offer = schemaOffer(candidate);
  assert.equal(offer.shippingDetails.shippingRate.value,'0.00');
  const feed = renderGoogleProductFeed({schemaVersion:2,products:[candidate]});
  assert.match(feed,/<g:price_threshold>50 USD<\/g:price_threshold>/);
  assert.match(feed,/<g:shipping>[\s\S]*?<g:price>8\.99 USD<\/g:price>/);
});

test('unknown products stay in the feed while the readiness command reports every public variant', () => {
  const unknown = {...product,handle:'unverified-public-product',variants:[product.variants[0],{...product.variants[0],id:'gid://shopify/ProductVariant/102'}]};
  const unmappedMugVariant = {...product,handle:'white-glossy-mug',variants:[{...product.variants[0],id:'gid://shopify/ProductVariant/103',selectedOptions:[{name:'Size',value:'unknown size'}]}]};
  assert.doesNotMatch(renderGoogleProductFeed({schemaVersion:2,products:[unknown]}),/<g:shipping>/);
  const catalog = {schemaVersion:2,products:[product,unknown,unmappedMugVariant,{...unknown,handle:'hidden-rattle',presentation:{kind:'hidden-add-on'}}]};
  const script = path.join(__dirname,'..','scripts','check-product-policy-readiness.js');
  const failed = spawnSync(process.execPath,[script,'--stdin'],{input:JSON.stringify(catalog),encoding:'utf8'});
  assert.equal(failed.status,1);
  assert.match(failed.stderr,/3 public variant\(s\).*unverified-public-product :: gid:\/\/shopify\/ProductVariant\/101.*unverified-public-product :: gid:\/\/shopify\/ProductVariant\/102.*white-glossy-mug :: gid:\/\/shopify\/ProductVariant\/103/s);
  assert.doesNotMatch(failed.stderr,/hidden-rattle/);

  const passed = spawnSync(process.execPath,[script,'--stdin'],{input:JSON.stringify({schemaVersion:2,products:[product]}),encoding:'utf8'});
  assert.equal(passed.status,0);
  assert.match(passed.stdout,/readiness passed/);
});

test('shared return policy preserves unused condition', () => {
  assert.equal(require('../lib/product-policies').merchantReturnPolicy().itemCondition, 'https://schema.org/NewCondition');
});
