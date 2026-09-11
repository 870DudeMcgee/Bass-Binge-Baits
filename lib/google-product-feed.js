'use strict';

const { productStructuredData } = require('./generic-product-route.js');
const { shippingRate } = require('./product-policies.js');

const ORIGIN = 'https://www.bassbingebaits.com';
const OPTION_FIELDS = new Set(['color', 'size', 'material', 'pattern']);
// Reviewed adult apparel and accessories; keep future products out until their audience is known.
const ADULT_APPAREL_HANDLES = new Set([
  'performance-crew-neck-t-shirt', 'lake-life-classic-tee', 'retro-3-4-sleeve-raglan-shirt',
  'bass-binge-baits-ringer-t-shirt', 'womens-relaxed-t-shirt', 'short-sleeve-t-shirt-1',
  'hooded-long-sleeve-tee', 'premium-full-zip-hoodie', 'bass-binge-hoodie',
  'bass-binge-baits-hoodie-1', 'bass-binge-baits-premium-sweatshirt',
  'heavyweight-hooded-sweatshirt-independent-trading-co-ind4000-2', 'bass-binge-baits-windbreaker',
  'lake-life-bucket-hat', 'camouflage-trucker-hat-1', 'bass-binge-baits-access-cap',
  'bass-binge-baits-hat', 'bass-binge-baits-trucker-cap', 'coastal-washed-cap',
  'retro-foam-trucker-hat', 'bass-binge-baits-embroidered-beanie-1',
  'tote-bag', 'lake-life-clear-tote-bag'
]);

function xml(value) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function numericId(value, label) {
  const match = String(value || '').match(/(?:^|\/)(\d+)$/);
  if (!match || match[1].length > 50) throw new Error(`Missing valid numeric ${label}`);
  return match[1];
}

function textFromHtml(value) {
  return String(value || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#0*39;|&apos;/gi, "'").replace(/\s+/g, ' ').trim();
}

function firstImage(product) {
  return (product.media || []).find((entry) => entry && entry.type === 'image' && entry.image && entry.image.url) || null;
}

function imageForVariant(product, variant) {
  if (variant && variant.image && variant.image.url) return { type: 'image', image: variant.image };
  const imageId = variant && variant.imageId;
  return (product.media || []).find((entry) => imageId && entry && entry.type === 'image' && entry.image && entry.image.url && (entry.id === imageId || entry.image.id === imageId)) || firstImage(product);
}

function additionalImageUrls(product, primaryImage) {
  const seen = new Set([String(primaryImage || '')]);
  return [
    ...(product.media || []).map(entry => entry && entry.type === 'image' && entry.image && entry.image.url),
    ...(product.variants || []).map(variant => variant && variant.image && variant.image.url),
  ].reduce((urls, value) => {
    const url = String(value || '');
    if (urls.length === 10 || !/^https?:\/\//i.test(url) || seen.has(url)) return urls;
    seen.add(url);
    urls.push(url);
    return urls;
  }, []);
}

function optionFields(product, variant) {
  return (variant.selectedOptions || []).reduce((fields, option) => {
    const normalized = String(option && option.name || '').trim().toLowerCase();
    let name = normalized === 'colour' ? 'color' : normalized;
    if ((product.handle === '3-4-oz-football-jig' && normalized === '3/4 oz.') || (product.handle === 'pee-wee-football' && normalized === 'pee wee + colors')) name = 'color';
    if (normalized === 'weight') name = 'size';
    if (OPTION_FIELDS.has(name) && option && option.value) fields[name] = String(option.value);
    return fields;
  }, {});
}

function catalogAudienceFields(product, description) {
  if (ADULT_APPAREL_HANDLES.has(product.handle)) {
    return { age_group: 'adult', gender: product.handle === 'womens-relaxed-t-shirt' ? 'female' : 'unisex' };
  }
  const copy = `${product.title || ''} ${description || ''}`;
  if (/\bwomen(?:'s|s)?\b/i.test(copy)) return { gender: 'female' };
  if (/\bunisex\b/i.test(copy)) return { gender: 'unisex' };
  return {};
}

function shippingXml(product, variant) {
  const rate = shippingRate(product, variant);
  if (!rate) return '';
  const regions = rate.regions || [null];
  const blocks = regions.map((region) => `      <g:shipping>\n        <g:country>US</g:country>${region ? `\n        <g:region>${region}</g:region>` : ''}\n        <g:service>Standard</g:service>\n        <g:price>${rate.price} USD</g:price>\n        <g:min_handling_time>${rate.handling[0]}</g:min_handling_time>\n        <g:max_handling_time>${rate.handling[1]}</g:max_handling_time>\n        <g:min_transit_time>${rate.transit[0]}</g:min_transit_time>\n        <g:max_transit_time>${rate.transit[1]}</g:max_transit_time>\n      </g:shipping>`);
  if (rate.freeThreshold) blocks.push(`      <g:free_shipping_threshold>\n        <g:country>US</g:country>\n        <g:price_threshold>${rate.freeThreshold} USD</g:price_threshold>\n      </g:free_shipping_threshold>`);
  blocks.push('      <g:shipping_handling_business_days>M-F</g:shipping_handling_business_days>', '      <g:shipping_transit_business_days>M-F</g:shipping_transit_business_days>');
  return `\n${blocks.join('\n')}`;
}

function itemForVariant(product, variant, schemaVariant, description, schemaImage) {
  const id = numericId(variant && variant.id, 'variant id');
  const groupId = numericId(product.id, 'product id');
  const canonical = `${ORIGIN}/products/${encodeURIComponent(product.handle)}`;
  const image = schemaVariant && schemaVariant.image || schemaImage;
  const price = variant && variant.price;
  const amount = String(price && price.amount || '');
  const currency = String(price && price.currencyCode || '');
  if (!product.handle || !product.title || !description || !image || !product.vendor || !/^\d+(?:\.\d+)?$/.test(amount) || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error(`Product ${product.handle || groupId} has incomplete Google Merchant data`);
  }
  const fields = {
    ...catalogAudienceFields(product, description),
    ...optionFields(product, variant),
    ...(schemaVariant ? Object.fromEntries(Object.entries(schemaVariant).filter(([key]) => OPTION_FIELDS.has(key))) : {})
  };
  const title = schemaVariant && schemaVariant.name || product.title;
  const lines = [
    ['g:id', id], ['g:item_group_id', groupId], ['g:title', title], ['g:description', description],
    ['g:link', `${canonical}?variant=${id}`], ['g:image_link', image], ['g:price', `${amount} ${currency}`],
    ['g:availability', variant.availableForSale ? 'in_stock' : 'out_of_stock'], ['g:condition', 'new'], ['g:brand', product.vendor]
  ];
  for (const additionalImage of additionalImageUrls(product, image)) lines.push(['g:additional_image_link', additionalImage]);
  for (const name of ['color', 'size', 'material', 'pattern', 'gender', 'age_group']) if (fields[name]) lines.push([`g:${name}`, fields[name]]);
  return `    <item>\n${lines.map(([name, value]) => `      <${name}>${xml(value)}</${name}>`).join('\n')}${shippingXml(product, variant)}\n    </item>`;
}

function renderGoogleProductFeed(catalog) {
  if (!catalog || catalog.schemaVersion !== 2 || !Array.isArray(catalog.products) || catalog.products.length === 0) throw new Error('Admitted catalog unavailable or empty');
  const items = [];
  for (const product of catalog.products) {
    if (!product || product.presentation?.kind === 'hidden-add-on') continue;
    if (!Array.isArray(product.variants) || product.variants.length === 0) throw new Error('Catalog includes an invalid product');
    const canonical = `${ORIGIN}/products/${encodeURIComponent(product.handle || '')}`;
    const description = textFromHtml(product.descriptionHtml) || String(product.title || '');
    const schema = productStructuredData(product, description, imageForVariant(product, product.variants[0]), canonical);
    const variants = schema.hasVariant || [];
    product.variants.forEach((variant, index) => items.push(itemForVariant(product, variant, variants[index], description, schema.image)));
  }
  if (!items.length) throw new Error('Admitted catalog unavailable or empty');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>Bass Binge Baits products</title>\n    <link>${ORIGIN}</link>\n    <description>Official Bass Binge Baits products</description>\n${items.join('\n')}\n  </channel>\n</rss>\n`;
}

function createGoogleProductFeedHandler({ getCatalog }) {
  return async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.setHeader('Allow', 'GET, HEAD'); return response.status(405).send('Method not allowed'); }
    try {
      const body = renderGoogleProductFeed(await getCatalog(request));
      response.setHeader('Content-Type', 'application/xml; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=300, stale-if-error=86400');
      return response.status(200).send(request.method === 'HEAD' ? '' : body);
    } catch (error) {
      console.error('Google product feed unavailable', { message: error.message });
      response.setHeader('Cache-Control', 'no-store'); response.setHeader('Retry-After', '300');
      return response.status(503).send('Google product feed temporarily unavailable. Please retry later.');
    }
  };
}

module.exports = { createGoogleProductFeedHandler, renderGoogleProductFeed, xml };
