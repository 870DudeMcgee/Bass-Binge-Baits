'use strict';

const { getCatalog } = require('../lib/shopify-catalog.js');
const { publicCatalogPayload } = require('../lib/catalog-public.js');

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  try {
    const catalog = await getCatalog(request);
    response.setHeader('Cache-Control', 'public, s-maxage=45, stale-while-revalidate=300');
    return response.status(200).json(publicCatalogPayload(catalog));
  } catch (error) {
    console.error('Shopify catalog adapter failed', {
      message: error.message,
      details: error.details || null
    });
    response.setHeader('Cache-Control', 'no-store');
    return response.status(502).json({
      ok: false,
      code: 'shopify_catalog_unavailable',
      message: 'The live catalog is temporarily unavailable.'
    });
  }
};
