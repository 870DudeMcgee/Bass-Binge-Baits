'use strict';

const { timingSafeEqual } = require('node:crypto');
const { reconcileCatalog } = require('../lib/shopify-catalog.js');

function bearerToken(request) {
  const authorization = request && request.headers &&
    (request.headers.authorization || request.headers.Authorization) || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization));
  return match ? match[1] : null;
}

function tokensMatch(provided, configured) {
  if (!provided || !configured) return false;
  const left = Buffer.from(String(provided));
  const right = Buffer.from(String(configured));
  return left.length === right.length && timingSafeEqual(left, right);
}

function createCatalogReconcileHandler(options = {}) {
  const reconcile = options.reconcile || reconcileCatalog;
  const getSecret = options.getSecret || (() => process.env.CRON_SECRET);

  return async function catalogReconcileHandler(request, response) {
    response.setHeader('Cache-Control', 'private, no-store');
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return response.status(405).json({
        ok: false,
        code: 'catalog_reconcile_method_not_allowed',
        message: 'Method not allowed.'
      });
    }
    const secret = getSecret();
    if (!secret) {
      return response.status(503).json({
        ok: false,
        code: 'catalog_reconcile_not_configured',
        message: 'Catalog reconciliation is not configured.'
      });
    }
    if (!tokensMatch(bearerToken(request), secret)) {
      return response.status(401).json({
        ok: false,
        code: 'catalog_reconcile_unauthorized',
        message: 'Unauthorized.'
      });
    }
    try {
      const catalog = await reconcile(request);
      return response.status(200).json({
        ok: true,
        generationId: catalog.generationId,
        generatedAt: catalog.generatedAt,
        sourceUpdatedAt: catalog.sourceUpdatedAt,
        lastSuccessfulRefreshAt: catalog.lastSuccessfulRefreshAt
      });
    } catch (error) {
      console.error('Catalog reconciliation failed', { message: error.message });
      return response.status(502).json({
        ok: false,
        code: 'catalog_reconcile_failed',
        message: 'Catalog reconciliation failed.'
      });
    }
  };
}

module.exports = createCatalogReconcileHandler();
module.exports.createCatalogReconcileHandler = createCatalogReconcileHandler;
