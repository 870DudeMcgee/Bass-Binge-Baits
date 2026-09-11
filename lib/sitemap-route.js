'use strict';

const ORIGIN = 'https://www.bassbingebaits.com';
const STATIC_PATHS = ['/', '/shop', '/about', '/contact', '/returns', '/privacy'];

function xml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function imageUrls(product) {
  const seen = new Set();
  return [
    ...(product.media || []).map(entry => entry && entry.type === 'image' && entry.image && entry.image.url),
    ...(product.variants || []).map(variant => variant && variant.image && variant.image.url),
  ].reduce((urls, value) => {
    const url = String(value || '');
    if (!/^https?:\/\//i.test(url) || seen.has(url)) return urls;
    seen.add(url);
    urls.push(url);
    return urls;
  }, []);
}

function renderSitemap(catalog) {
  if (!catalog || catalog.schemaVersion !== 2 || !Array.isArray(catalog.products)) {
    throw new Error('Admitted catalog unavailable');
  }
  const entries = new Map(STATIC_PATHS.map(path => [path, []]));
  for (const product of catalog.products) {
    if (!product || product.presentation?.kind === 'hidden-add-on') continue;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.handle || '')) {
      throw new Error('Invalid admitted product handle');
    }
    const path = `/products/${product.handle}`;
    const images = entries.get(path) || [];
    const seen = new Set(images);
    for (const url of imageUrls(product)) {
      if (!seen.has(url)) { seen.add(url); images.push(url); }
    }
    entries.set(path, images);
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
    [...entries].map(([path, images]) => `  <url><loc>${ORIGIN}${path}</loc>${images.map(url => `<image:image><image:loc>${xml(url)}</image:loc></image:image>`).join('')}</url>`).join('\n') +
    '\n</urlset>\n';
}

function createSitemapHandler({ getCatalog }) {
  return async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('Allow', 'GET, HEAD');
      return response.status(405).send('Method not allowed');
    }
    try {
      const xml = renderSitemap(await getCatalog(request));
      response.setHeader('Content-Type', 'application/xml; charset=utf-8');
      response.setHeader('Cache-Control', 'public, s-maxage=300, stale-if-error=86400');
      return response.status(200).send(request.method === 'HEAD' ? '' : xml);
    } catch (error) {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Retry-After', '300');
      return response.status(503).send('Sitemap temporarily unavailable. Please retry later.');
    }
  };
}

module.exports = { renderSitemap, createSitemapHandler, STATIC_PATHS };
