'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { storefrontRequest } = require('../lib/shopify-storefront.js');

test('storefront requests prefer the public token when both token types exist', async () => {
  const originalEnvironment = {
    domain: process.env.SHOPIFY_STORE_DOMAIN,
    privateToken: process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN,
    publicToken: process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN
  };
  const originalFetch = global.fetch;
  let observedHeaders;

  process.env.SHOPIFY_STORE_DOMAIN = 'store.example.myshopify.com';
  process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN = 'private-token';
  process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN = 'public-token';
  global.fetch = async (_url, options) => {
    observedHeaders = options.headers;
    return {
      ok: true,
      async json() {
        return { data: { shop: { name: 'Example' } } };
      }
    };
  };

  try {
    await storefrontRequest('query { shop { name } }');
  } finally {
    global.fetch = originalFetch;
    for (const [name, value] of Object.entries({
      SHOPIFY_STORE_DOMAIN: originalEnvironment.domain,
      SHOPIFY_STOREFRONT_PRIVATE_TOKEN: originalEnvironment.privateToken,
      SHOPIFY_STOREFRONT_ACCESS_TOKEN: originalEnvironment.publicToken
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }

  assert.equal(
    observedHeaders['X-Shopify-Storefront-Access-Token'],
    'public-token'
  );
  assert.equal(
    observedHeaders['Shopify-Storefront-Private-Token'],
    undefined
  );
});
