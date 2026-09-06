'use strict';

const { getCatalog } = require('../lib/shopify-catalog.js');
const { createSitemapHandler } = require('../lib/sitemap-route.js');

module.exports = createSitemapHandler({ getCatalog });
