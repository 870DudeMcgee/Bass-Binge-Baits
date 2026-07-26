#!/usr/bin/env node

'use strict';

const { loadFreshCatalog } = require('../lib/shopify-catalog.js');

async function run() {
  const strict = process.argv.includes('--strict');
  const catalog = await loadFreshCatalog({ headers: {} });
  const legacy = catalog.legacy || catalog;

  console.log(`Connected to Shopify and normalized ${catalog.products.length} CatalogEnvelope v2 products.`);
  console.log(`Legacy storefront projection: ${legacy.products.length} established products.`);
  console.log(`Current limited drop: ${legacy.currentDrop ? legacy.currentDrop.title : 'not available'}.`);
  console.log(`Rattle Add-on: ${legacy.rattle ? 'available to adapter' : 'not available'}.`);

  if (legacy.errors.length || catalog.quarantine.length) {
    console.log('\nShopify setup blockers:');
    legacy.errors.forEach((error) => console.log(`- [${error.code}] ${error.message}`));
    catalog.quarantine.forEach((issue) => {
      console.log(`- [${issue.severity}:${issue.code}] ${issue.message}`);
    });
  }

  if (strict && (
    legacy.errors.length ||
    catalog.outcomes.variantBlocked.length ||
    catalog.outcomes.productQuarantined.length
  )) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(`Shopify integration validation failed: ${error.message}`);
  process.exit(1);
});
