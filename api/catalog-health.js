'use strict';

const { createCatalogHealthHandler } = require('../lib/catalog-health.js');
const { getCatalog } = require('../lib/shopify-catalog.js');

module.exports = createCatalogHealthHandler({ getCatalog });
