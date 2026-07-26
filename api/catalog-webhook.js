'use strict';

const { waitUntil } = require('@vercel/functions');
const { createCatalogWebhookHandler } = require('../lib/catalog-webhook.js');
const {
  acceptCatalogInvalidation,
  runScheduledCatalogRefresh
} = require('../lib/shopify-catalog.js');

const handler = createCatalogWebhookHandler({
  acceptInvalidation: acceptCatalogInvalidation,
  runScheduledRefresh: runScheduledCatalogRefresh,
  defer: waitUntil
});

handler.config = {
  api: {
    bodyParser: false
  }
};

module.exports = handler;
