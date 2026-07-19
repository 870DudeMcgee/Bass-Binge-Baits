#!/usr/bin/env node

'use strict';

const { loadFreshCatalog } = require('../lib/shopify-catalog.js');

async function run() {
  const strict = process.argv.includes('--strict');
  const catalog = await loadFreshCatalog({ headers: {} });

  console.log(`Connected to Shopify and normalized ${catalog.products.length} established products.`);
  console.log(`Current limited drop: ${catalog.currentDrop ? catalog.currentDrop.title : 'not available'}.`);
  console.log(`Rattle Add-on: ${catalog.rattle ? 'available to adapter' : 'not available'}.`);

  if (catalog.errors.length) {
    console.log('\nShopify setup blockers:');
    catalog.errors.forEach((error) => console.log(`- [${error.code}] ${error.message}`));
  }

  if (strict && catalog.errors.length) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(`Shopify integration validation failed: ${error.message}`);
  process.exit(1);
});
