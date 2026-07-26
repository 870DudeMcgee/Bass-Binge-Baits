'use strict';

const { timingSafeEqual } = require('node:crypto');

function bearerToken(request) {
  const headers = request && request.headers || {};
  const authorization = headers.authorization || headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization));
  return match ? match[1] : null;
}

function tokensMatch(provided, configured) {
  if (!provided || !configured) return false;
  const providedBuffer = Buffer.from(String(provided));
  const configuredBuffer = Buffer.from(String(configured));
  return providedBuffer.length === configuredBuffer.length &&
    timingSafeEqual(providedBuffer, configuredBuffer);
}

function publicIssue(issue) {
  return {
    severity: issue.severity,
    field: issue.field || null,
    message: issue.message,
    remedy: issue.remedy || null,
    variantId: issue.variantId || null,
    observedAt: issue.observedAt || null
  };
}

function catalogHealth(catalog) {
  const outcomes = catalog && catalog.outcomes || {};
  const accepted = Array.isArray(outcomes.accepted) ? outcomes.accepted : [];
  const warnings = Array.isArray(outcomes.warning) ? outcomes.warning : [];
  const variantBlocked = Array.isArray(outcomes.variantBlocked) ? outcomes.variantBlocked : [];
  const productQuarantined = Array.isArray(outcomes.productQuarantined)
    ? outcomes.productQuarantined
    : [];
  const issues = {};

  [...warnings, ...variantBlocked, ...productQuarantined].forEach((issue) => {
    const handle = issue && issue.handle || '_catalog';
    const code = issue && issue.code || 'catalog_issue_unknown';
    if (!issues[handle]) issues[handle] = {};
    if (!issues[handle][code]) issues[handle][code] = [];
    issues[handle][code].push(publicIssue(issue));
  });

  const quarantinedProducts = new Set(productQuarantined.map((issue) =>
    issue && (issue.productId || issue.handle || issue.code)
  ).filter(Boolean));
  const products = Array.isArray(catalog && catalog.products) ? catalog.products : [];

  return {
    ok: true,
    schemaVersion: catalog && catalog.schemaVersion || null,
    generationId: catalog && catalog.generationId || null,
    generatedAt: catalog && catalog.generatedAt || null,
    sourceUpdatedAt: catalog && catalog.sourceUpdatedAt || null,
    freshness: catalog && catalog.freshness || null,
    stale: Boolean(catalog && catalog.stale),
    counts: {
      accepted: accepted.length,
      quarantined: quarantinedProducts.size,
      variantBlocked: variantBlocked.length,
      warnings: warnings.length,
      customerVisible: products.filter((product) =>
        product && (!product.presentation || product.presentation.kind !== 'hidden-add-on')
      ).length
    },
    issues
  };
}

function createCatalogHealthHandler(dependencies) {
  const getCatalog = dependencies && dependencies.getCatalog;
  const getToken = dependencies && dependencies.getToken ||
    (() => process.env.CATALOG_HEALTH_TOKEN);
  if (typeof getCatalog !== 'function') {
    throw new TypeError('createCatalogHealthHandler requires getCatalog');
  }

  return async function catalogHealthHandler(request, response) {
    response.setHeader('Cache-Control', 'private, no-store');
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return response.status(405).json({
        ok: false,
        code: 'catalog_health_method_not_allowed',
        message: 'Method not allowed.'
      });
    }

    const configuredToken = getToken();
    if (!configuredToken) {
      return response.status(503).json({
        ok: false,
        code: 'catalog_health_not_configured',
        message: 'Catalog health access is not configured.'
      });
    }
    if (!tokensMatch(bearerToken(request), configuredToken)) {
      return response.status(401).json({
        ok: false,
        code: 'catalog_health_unauthorized',
        message: 'Unauthorized.'
      });
    }

    try {
      return response.status(200).json(catalogHealth(await getCatalog(request)));
    } catch (error) {
      console.error('Catalog health check failed', { message: error.message });
      return response.status(502).json({
        ok: false,
        code: 'catalog_health_unavailable',
        message: 'Catalog health is temporarily unavailable.'
      });
    }
  };
}

module.exports = {
  catalogHealth,
  createCatalogHealthHandler
};
