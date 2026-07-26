'use strict';

const { createHash } = require('node:crypto');

const CATALOG_SCHEMA_VERSION = 2;
const DEFAULT_SHOP_DOMAIN = 'bassbingebaits.myshopify.com';

class CatalogNamespaceConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CatalogNamespaceConfigurationError';
    this.code = 'catalog_namespace_invalid';
    this.statusCode = 503;
  }
}

function validatedShopIdentity(value) {
  const shopDomain = String(value || DEFAULT_SHOP_DOMAIN).trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(shopDomain)) {
    throw new CatalogNamespaceConfigurationError(
      'The Shopify store domain is not a valid myshopify.com identity.'
    );
  }
  return shopDomain;
}

function deploymentTrustIdentity(environment) {
  const vercelEnvironment = String(environment.VERCEL_ENV || 'development')
    .trim()
    .toLowerCase();
  if (!['production', 'preview', 'development'].includes(vercelEnvironment)) {
    throw new CatalogNamespaceConfigurationError(
      'The deployment environment is not a supported trust domain.'
    );
  }
  const targetEnvironment = String(
    environment.VERCEL_TARGET_ENV || vercelEnvironment
  ).trim().toLowerCase();
  let deploymentIdentity;
  if (vercelEnvironment === 'production') {
    deploymentIdentity = String(
      environment.VERCEL_PROJECT_PRODUCTION_URL || ''
    ).trim().toLowerCase();
    if (!deploymentIdentity) {
      throw new CatalogNamespaceConfigurationError(
        'Production catalog state requires a project trust identity.'
      );
    }
  } else if (vercelEnvironment === 'preview') {
    const deploymentId = String(environment.VERCEL_DEPLOYMENT_ID || '').trim();
    deploymentIdentity = deploymentId || String(environment.VERCEL_URL || '')
      .trim()
      .toLowerCase();
    if (!deploymentIdentity) {
      throw new CatalogNamespaceConfigurationError(
        'Preview catalog state requires a unique deployment identity.'
      );
    }
  } else {
    const deploymentId = String(environment.VERCEL_DEPLOYMENT_ID || '').trim();
    deploymentIdentity = deploymentId || String(environment.VERCEL_URL || 'local')
      .trim()
      .toLowerCase();
  }
  return [vercelEnvironment, targetEnvironment, deploymentIdentity].join(':');
}

function deriveCatalogNamespace(environment = process.env, override) {
  const shopIdentity = validatedShopIdentity(environment.SHOPIFY_STORE_DOMAIN);
  const trustIdentity = deploymentTrustIdentity(environment);
  const trustHash = createHash('sha256').update(trustIdentity).digest('hex').slice(0, 24);
  const namespace = [
    'bass-binge',
    'catalog',
    `v${CATALOG_SCHEMA_VERSION}`,
    shopIdentity,
    trustHash
  ].join(':');
  const configuredOverride = override === undefined
    ? environment.CATALOG_CACHE_NAMESPACE
    : override;
  if (
    configuredOverride !== undefined &&
    configuredOverride !== null &&
    String(configuredOverride).trim() !== namespace
  ) {
    throw new CatalogNamespaceConfigurationError(
      'The configured catalog namespace does not match the deployment trust identity.'
    );
  }
  return namespace;
}

module.exports = {
  CatalogNamespaceConfigurationError,
  deriveCatalogNamespace
};
