#!/usr/bin/env node

'use strict';

const { missingShippingPolicyVariants } = require('../lib/product-policies.js');

async function stdinJson() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return JSON.parse(input);
}

async function loadCatalog() {
  if (process.argv.includes('--stdin')) return stdinJson();
  const { getCatalog } = require('../lib/shopify-catalog.js');
  return getCatalog({ headers: {} });
}

async function main() {
  const catalog = await loadCatalog();
  const missing = missingShippingPolicyVariants(catalog);
  if (missing.length) {
    console.error(`Product policy readiness failed: ${missing.length} public variant(s) lack an exact shipping mapping.`);
    for (const issue of missing) console.error(`- ${issue.handle} :: ${issue.variantId}`);
    process.exitCode = 1;
    return;
  }
  const publicVariantCount = catalog.products
    .filter(product => product && product.presentation?.kind !== 'hidden-add-on')
    .reduce((count, product) => count + (Array.isArray(product.variants) ? product.variants.length : 0), 0);
  console.log(`Product policy readiness passed: ${publicVariantCount} public variant(s) checked.`);
}

main().catch(error => {
  console.error(`Product policy readiness failed: ${error.message}`);
  process.exitCode = 1;
});
