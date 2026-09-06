'use strict';

const ORIGIN = 'https://www.bassbingebaits.com';
const STATIC_PATHS = ['/', '/shop', '/about', '/contact', '/privacy'];

function renderSitemap(catalog) {
  if (!catalog || catalog.schemaVersion !== 2 || !Array.isArray(catalog.products)) {
    throw new Error('Admitted catalog unavailable');
  }
  const paths = [...STATIC_PATHS];
  for (const product of catalog.products) {
    if (!product || product.presentation?.kind === 'hidden-add-on') continue;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.handle || '')) {
      throw new Error('Invalid admitted product handle');
    }
    paths.push(`/products/${product.handle}`);
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    [...new Set(paths)].map(path => `  <url><loc>${ORIGIN}${path}</loc></url>`).join('\n') +
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
