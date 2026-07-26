'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');

const DEFAULT_TOPICS = new Set([
  'products/create',
  'products/update',
  'products/delete',
  'product_publications/create',
  'product_publications/update',
  'product_publications/delete',
  'inventory_items/create',
  'inventory_items/delete',
  'inventory_items/update',
  'inventory_levels/connect',
  'inventory_levels/disconnect',
  'inventory_levels/update'
]);
const MAX_BODY_BYTES = 1024 * 1024;

function header(request, name) {
  const headers = request && request.headers || {};
  const value = headers[name] === undefined ? headers[name.toLowerCase()] : headers[name];
  return Array.isArray(value) ? value[0] : String(value || '');
}

function canonicalHmacHeader(request) {
  const headers = request && request.headers || {};
  const matches = Object.entries(headers).filter(([name]) =>
    name.toLowerCase() === 'x-shopify-hmac-sha256'
  );
  if (matches.length !== 1 || typeof matches[0][1] !== 'string') return '';
  return matches[0][1];
}

function assertBodyLength(length) {
  if (length > MAX_BODY_BYTES) {
    throw new Error('Webhook body is too large.');
  }
}

function boundedBody(rawBody) {
  assertBodyLength(rawBody.length);
  return rawBody;
}

async function readRawBody(request) {
  if (Buffer.isBuffer(request && request.rawBody)) {
    return boundedBody(request.rawBody);
  }
  if (typeof (request && request.rawBody) === 'string') {
    return boundedBody(Buffer.from(request.rawBody));
  }
  if (!request || typeof request[Symbol.asyncIterator] !== 'function') {
    throw new Error('Raw webhook bytes are unavailable.');
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    assertBodyLength(length);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function signaturesMatch(rawBody, provided, secret) {
  if (!provided || !secret) return false;
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(provided)
  ) {
    return false;
  }
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(provided, 'base64');
  return received.toString('base64') === provided &&
    received.length === expected.length &&
    timingSafeEqual(received, expected);
}

function sendJson(response, statusCode, payload) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(statusCode).json(payload);
}

function createCatalogWebhookHandler(options = {}) {
  const getSecret = options.getSecret || (() => process.env.SHOPIFY_WEBHOOK_SECRET);
  const getExpectedShopDomain = options.getExpectedShopDomain ||
    (() => process.env.SHOPIFY_STORE_DOMAIN || 'bassbingebaits.myshopify.com');
  const acceptInvalidation = options.acceptInvalidation;
  const runScheduledRefresh = options.runScheduledRefresh;
  const defer = options.defer;
  const delay = options.delay || ((milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const debounceMs = options.debounceMs || 250;
  const topics = options.topics || DEFAULT_TOPICS;
  const logger = options.logger || console;

  if (typeof acceptInvalidation !== 'function') {
    throw new TypeError('createCatalogWebhookHandler requires acceptInvalidation');
  }
  if (typeof runScheduledRefresh !== 'function') {
    throw new TypeError('createCatalogWebhookHandler requires runScheduledRefresh');
  }
  if (typeof defer !== 'function') {
    throw new TypeError('createCatalogWebhookHandler requires a durable defer function');
  }

  return async function catalogWebhookHandler(request, response) {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return sendJson(response, 405, {
        ok: false,
        code: 'catalog_webhook_method_not_allowed',
        message: 'Method not allowed.'
      });
    }

    const secret = getSecret();
    if (!secret) {
      return sendJson(response, 503, {
        ok: false,
        code: 'catalog_webhook_not_configured',
        message: 'Catalog webhook verification is not configured.'
      });
    }

    let rawBody;
    try {
      rawBody = await readRawBody(request);
    } catch (error) {
      return sendJson(response, 400, {
        ok: false,
        code: 'catalog_webhook_raw_body_required',
        message: 'The raw webhook body is required.'
      });
    }

    if (!signaturesMatch(rawBody, canonicalHmacHeader(request), secret)) {
      return sendJson(response, 401, {
        ok: false,
        code: 'catalog_webhook_invalid_hmac',
        message: 'Webhook signature is invalid.'
      });
    }

    const webhookId = header(request, 'x-shopify-webhook-id');
    const topic = header(request, 'x-shopify-topic').toLowerCase();
    const shopDomain = header(request, 'x-shopify-shop-domain').toLowerCase();
    const expectedShopDomain = String(getExpectedShopDomain() || '').toLowerCase();
    if (!webhookId || !topics.has(topic) || (expectedShopDomain && shopDomain !== expectedShopDomain)) {
      return sendJson(response, 400, {
        ok: false,
        code: 'catalog_webhook_invalid_metadata',
        message: 'Webhook metadata is invalid.'
      });
    }

    const accepted = await acceptInvalidation({ webhookId, topic });
    if (accepted.duplicate) {
      return sendJson(response, 200, {
        ok: true,
        duplicate: true,
        scheduled: false
      });
    }

    if (accepted.scheduled) {
      const task = delay(debounceMs)
        .then(() => runScheduledRefresh({ headers: {} }, accepted.scheduleToken))
        .catch((error) => {
          logger.error('Deferred catalog refresh failed', { message: error.message });
        });
      defer(task);
    }

    return sendJson(response, 202, {
      ok: true,
      duplicate: false,
      scheduled: Boolean(accepted.scheduled)
    });
  };
}

module.exports = {
  DEFAULT_TOPICS,
  readRawBody,
  signaturesMatch,
  createCatalogWebhookHandler
};
