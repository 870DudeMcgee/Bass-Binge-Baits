'use strict';

const { productStructuredData } = require('./generic-product-route.js');

const ORIGIN = 'https://www.bassbingebaits.com';
const OPTION_FIELDS = new Set(['color', 'size', 'material', 'pattern']);

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
  const fields = schemaVariant ? Object.fromEntries(Object.entries(schemaVariant).filter(([key]) => OPTION_FIELDS.has(key))) : optionFields(product, variant);
  const title = schemaVariant && schemaVariant.name || product.title;
  const lines = [
    ['g:id', id], ['g:item_group_id', groupId], ['g:title', title], ['g:description', description],
    ['g:link', `${canonical}?variant=${id}`], ['g:image_link', image], ['g:price', `${amount} ${currency}`],
    ['g:availability', variant.availableForSale ? 'in_stock' : 'out_of_stock'], ['g:condition', 'new'], ['g:brand', product.vendor]
  ];
  for (const name of ['color', 'size', 'material', 'pattern']) if (fields[name]) lines.push([`g:${name}`, fields[name]]);
  return `    <item>\n${lines.map(([name, value]) => `      <${name}>${xml(value)}</${name}>`).join('\n')}\n    </item>`;
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
