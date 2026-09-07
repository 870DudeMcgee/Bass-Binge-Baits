'use strict';
const { getCatalog } = require('../lib/shopify-catalog.js');
const { createGoogleProductFeedHandler } = require('../lib/google-product-feed.js');
module.exports = createGoogleProductFeedHandler({ getCatalog });
