'use strict';

const DEFAULT_DOMAIN = 'bassbingebaits.myshopify.com';
const DEFAULT_API_VERSION = '2026-01';

function getConfig() {
  return {
    domain: process.env.SHOPIFY_STORE_DOMAIN || DEFAULT_DOMAIN,
    apiVersion: process.env.SHOPIFY_STOREFRONT_API_VERSION || DEFAULT_API_VERSION,
    privateToken: process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN || '',
    publicToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || ''
  };
}

function getBuyerIp(request) {
  const forwarded = request && request.headers && request.headers['x-forwarded-for'];
  return String(Array.isArray(forwarded) ? forwarded[0] : forwarded || '')
    .split(',')[0]
    .trim();
}

async function storefrontRequest(query, variables, request) {
  const config = getConfig();
  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': 'bass-binge-storefront/1.0'
  };
  const buyerIp = getBuyerIp(request);

  if (config.privateToken) {
    headers['Shopify-Storefront-Private-Token'] = config.privateToken;
  } else if (config.publicToken) {
    headers['X-Shopify-Storefront-Access-Token'] = config.publicToken;
  }

  if (buyerIp) {
    headers['Shopify-Storefront-Buyer-IP'] = buyerIp;
  }

  const response = await fetch(
    `https://${config.domain}/api/${config.apiVersion}/graphql.json`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables: variables || {} }),
      signal: AbortSignal.timeout(8000)
    }
  );

  let payload;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    const failure = new Error(`Shopify Storefront API returned ${response.status}`);
    failure.statusCode = response.status;
    failure.details = payload;
    throw failure;
  }

  if (!payload || (payload.errors && payload.errors.length)) {
    const failure = new Error('Shopify Storefront API query failed');
    failure.statusCode = 502;
    failure.details = payload && payload.errors ? payload.errors : null;
    throw failure;
  }

  return payload.data;
}

function hasPrivateCatalogAccess() {
  const config = getConfig();
  return Boolean(config.privateToken || config.publicToken);
}

module.exports = {
  getConfig,
  hasPrivateCatalogAccess,
  storefrontRequest
};
