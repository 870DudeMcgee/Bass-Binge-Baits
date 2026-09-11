'use strict';

const fs = require('node:fs');
const path = require('node:path');
const template = fs.readFileSync(path.join(__dirname, 'shop-template.html'), 'utf8');
const MARKER = '<!-- SHOP_PRODUCT_CARDS -->';

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderShopPage(catalog) {
  if (!catalog || catalog.schemaVersion !== 2 || !Array.isArray(catalog.products)) {
    throw new Error('Admitted catalog unavailable');
  }
  const handles = new Set();
  const cards = [];
  for (const product of catalog.products) {
    if (product?.presentation?.kind === 'hidden-add-on') continue;
    if (!product || typeof product.handle !== 'string' ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.handle) || handles.has(product.handle) ||
        typeof product.title !== 'string' || !product.title.trim()) {
      throw new Error('Invalid admitted product');
    }
    handles.add(product.handle);
    const media = Array.isArray(product.media) ? product.media : [];
    const image = media.find(item => item?.type === 'image' && item.id === product.featuredMediaId) ||
      media.find(item => item?.type === 'image' && item.image?.url);
    const url = image?.image?.url;
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      throw new Error('Admitted product image unavailable');
    }
    const title = escapeHtml(product.title);
    cards.push(`<article class="product-card" data-server-product="${product.handle}">
            <div class="product-media"><img src="${escapeHtml(url)}" alt="${escapeHtml(image.alt || product.title)}" loading="lazy" /></div>
            <div class="product-top"><h3><a href="/products/${product.handle}">${title}</a></h3></div>
          </article>`);
  }
  if (!cards.length || template.split(MARKER).length !== 2) throw new Error('Shop unavailable');
  return template.replace(MARKER, () => cards.join('\n          '));
}

function createShopHandler({ getCatalog }) {
  return async (request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      response.setHeader('Cache-Control', 'no-store');
      return response.status(405).send('Method not allowed');
    }
    try {
      const html = renderShopPage(await getCatalog(request));
      response.setHeader('Cache-Control', 'public, s-maxage=5, must-revalidate');
      return response.status(200).send(request.method === 'HEAD' ? '' : html);
    } catch (error) {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Retry-After', '300');
      return response.status(503).send(request.method === 'HEAD' ? '' : 'Shop temporarily unavailable. Please retry later.');
    }
  };
}

module.exports = { renderShopPage, createShopHandler };
