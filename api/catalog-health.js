'use strict';

const { createCatalogHealthHandler } = require('../lib/catalog-health.js');
const { getCatalogHealthState } = require('../lib/shopify-catalog.js');

module.exports = createCatalogHealthHandler({ getCatalogState: getCatalogHealthState });
