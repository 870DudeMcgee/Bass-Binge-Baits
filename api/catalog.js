'use strict';

const { getCatalog } = require('../lib/shopify-catalog.js');
const { publicCatalogPayload } = require('../lib/catalog-public.js');

function createCatalogHandler(options = {}) {
  const loadCatalog = options.getCatalog || getCatalog;

  return async function catalogHandler(request, response) {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return response.status(405).json({ ok: false, message: 'Method not allowed.' });
    }

    try {
      const catalog = await loadCatalog(request);
      response.setHeader('Cache-Control', 'public, s-maxage=5, must-revalidate');
      return response.status(200).json(publicCatalogPayload(catalog));
    } catch (error) {
      console.error('Shopify catalog adapter failed', {
        message: error.message,
        details: error.details || null
      });
      response.setHeader('Cache-Control', 'no-store');
      return response.status(error.statusCode === 503 ? 503 : 502).json({
        ok: false,
        code: 'shopify_catalog_unavailable',
        message: 'The live catalog is temporarily unavailable.'
      });
    }
  };
}

module.exports = createCatalogHandler();
module.exports.createCatalogHandler = createCatalogHandler;
