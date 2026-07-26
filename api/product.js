'use strict';

const { getCatalog } = require('../lib/shopify-catalog.js');
const { createGenericProductHandler } = require('../lib/generic-product-route.js');

module.exports = createGenericProductHandler({ getCatalog });
