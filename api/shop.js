'use strict';

const { getCatalog } = require('../lib/shopify-catalog.js');
const { createShopHandler } = require('../lib/shop-route.js');

module.exports = createShopHandler({ getCatalog });
