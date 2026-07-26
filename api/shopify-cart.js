'use strict';

const { randomUUID } = require('node:crypto');
const { storefrontRequest } = require('../lib/shopify-storefront.js');
const { getCatalog } = require('../lib/shopify-catalog.js');

const PUBLIC_CART_POLICY = Object.freeze({
  allowMissingOrigin: true,
  maxLines: 50,
  maxLineQuantity: 99
});

const CART_FIELDS = `
  id
  checkoutUrl
  totalQuantity
  lines(first: 100) {
    nodes {
      id
      quantity
      attributes { key value }
      merchandise { ... on ProductVariant { id } }
      ... on CartLine {
        parentRelationship { parent { id } }
      }
    }
  }
`;

const CART_CREATE = `
  mutation CreateBassBingeCart($input: CartInput!) {
    cartCreate(input: $input) {
      cart { ${CART_FIELDS} }
      userErrors { field message code }
      warnings { code message target }
    }
  }
`;

const CART_LINES_ADD = `
  mutation AddBassBingeRattles($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart { ${CART_FIELDS} }
      userErrors { field message code }
      warnings { code message target }
    }
  }
`;

function sendJson(response, statusCode, payload) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(statusCode).json(payload);
}

function isSameOrigin(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) return PUBLIC_CART_POLICY.allowMissingOrigin;
  try {
    return new URL(origin).host === host;
  } catch (error) {
    return false;
  }
}

function isVariantGid(value) {
  return /^gid:\/\/shopify\/ProductVariant\/\d+$/.test(String(value || ''));
}

function normalizeMoney(value) {
  if (!value || value.amount === null || value.amount === undefined) return null;
  const amount = String(value.amount);
  const currencyCode = String(value.currencyCode || '');
  if (
    !/^\d+(?:\.\d+)?$/.test(amount) ||
    Number(amount) < 0 ||
    !/^[A-Z]{3}$/.test(currencyCode)
  ) return null;
  return { amount, currencyCode };
}

function normalizeLines(body) {
  const rawLines = body && Array.isArray(body.lines) ? body.lines : [];
  if (!rawLines.length || rawLines.length > PUBLIC_CART_POLICY.maxLines) return null;

  const normalized = rawLines.map((line, index) => ({
    merchandiseId: String(line && line.merchandiseId || ''),
    rattleMerchandiseId: line && line.rattleMerchandiseId
      ? String(line.rattleMerchandiseId)
      : null,
    quantity: line && line.quantity,
    configurationId: String(line && line.configurationId || `line-${index}`).slice(0, 120),
    price: normalizeMoney(line && line.price)
  }));

  if (normalized.some((line) =>
    !isVariantGid(line.merchandiseId) ||
    !line.price ||
    !Number.isInteger(line.quantity) ||
    line.quantity < 1 ||
    line.quantity > PUBLIC_CART_POLICY.maxLineQuantity ||
    (line.rattleMerchandiseId && !isVariantGid(line.rattleMerchandiseId))
  )) return null;

  return normalized;
}

function mutationFailure(payload) {
  const errors = payload && payload.userErrors;
  if (!errors || !errors.length) return null;
  return errors.map((error) => error.message).join(' ');
}

function getConfigurationId(line) {
  const attribute = (line.attributes || []).find((item) => item.key === '_bass_binge_build');
  return attribute ? attribute.value : null;
}

function sameMoney(left, right) {
  return Boolean(
    left &&
    right &&
    left.amount === right.amount &&
    left.currencyCode === right.currencyCode
  );
}

function isQuarantined(catalog, product, variant) {
  return (catalog.quarantine || []).some((issue) =>
    (issue.severity === 'product-quarantined' && (
      issue.productId === product.id ||
      issue.handle === product.handle
    )) ||
    (issue.severity === 'variant-blocked' && issue.variantId === variant.id)
  );
}

function admittedParentFor(line, catalog) {
  const matches = [];
  (catalog.products || []).forEach((product) => {
    if (product && product.presentation && product.presentation.kind === 'hidden-add-on') return;
    (product && product.variants || []).forEach((variant) => {
      if (variant.id === line.merchandiseId) matches.push({ product, variant });
    });
  });
  if (matches.length !== 1) return null;

  const match = matches[0];
  if (
    isQuarantined(catalog, match.product, match.variant) ||
    !match.product.availableForSale ||
    !match.variant.availableForSale ||
    match.variant.quantityAvailable === 0 ||
    !sameMoney(line.price, match.variant.price)
  ) return null;
  return match;
}

function admittedRattleVariant(catalog) {
  const candidates = [];
  (catalog.products || []).forEach((product) => {
    if (!product || !product.presentation || product.presentation.kind !== 'hidden-add-on') return;
    (product.variants || []).forEach((variant) => {
      candidates.push({ product, variant });
    });
  });
  if (candidates.length !== 1) return null;
  const candidate = candidates[0];
  if (
    isQuarantined(catalog, candidate.product, candidate.variant) ||
    !candidate.product.availableForSale ||
    !candidate.variant.availableForSale ||
    candidate.variant.quantityAvailable === 0
  ) return null;
  return candidate.variant;
}

function createShopifyCartHandler(options = {}) {
  const loadCatalog = options.getCatalog || getCatalog;
  const requestStorefront = options.storefrontRequest || storefrontRequest;
  const createConfigurationId = options.createConfigurationId || randomUUID;

  return async function shopifyCartHandler(request, response) {
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return sendJson(response, 405, { ok: false, message: 'Method not allowed.' });
    }

    if (!isSameOrigin(request)) {
      return sendJson(response, 403, { ok: false, message: 'Request origin is not allowed.' });
    }

    const lines = normalizeLines(request.body);
    if (!lines) {
      return sendJson(response, 400, {
        ok: false,
        code: 'cart_request_invalid',
        message: 'Cart lines are invalid.'
      });
    }

    try {
      const catalog = await loadCatalog(request);
      if (
        !catalog ||
        catalog.schemaVersion !== 2 ||
        !catalog.generationId ||
        !Array.isArray(catalog.products)
      ) {
        const error = new Error('Catalog admission generation is unavailable.');
        error.statusCode = 503;
        throw error;
      }
      if (request.body.generationId !== catalog.generationId) {
        return sendJson(response, 409, {
          ok: false,
          code: 'cart_generation_stale',
          message: 'The catalog changed. Refresh before checkout.'
        });
      }
      if (new Set(lines.map((line) => line.configurationId)).size !== lines.length) {
        return sendJson(response, 400, {
          ok: false,
          code: 'cart_request_invalid',
          message: 'Cart line relationships are invalid.'
        });
      }
      const admittedParents = lines.map((line) => admittedParentFor(line, catalog));
      if (admittedParents.some((match) => !match)) {
        return sendJson(response, 422, {
          ok: false,
          code: 'cart_line_not_admitted',
          message: 'One or more cart lines are no longer available.'
        });
      }
      const rattleVariant = admittedRattleVariant(catalog);
      const invalidRattle = lines.some((line, index) => {
        if (!line.rattleMerchandiseId) return false;
        const presentation = admittedParents[index].product.presentation || {};
        return (
          !rattleVariant ||
          line.rattleMerchandiseId !== rattleVariant.id ||
          presentation.rattleEnabled !== true
        );
      });
      if (invalidRattle) {
        return sendJson(response, 422, {
          ok: false,
          code: 'cart_line_not_admitted',
          message: 'One or more cart lines are no longer available.'
        });
      }
      const admittedLines = lines.map((line, index) => ({
        ...line,
        serverConfigurationId: String(createConfigurationId({ line, index, catalog }))
      }));
      if (
        admittedLines.some((line) => !line.serverConfigurationId) ||
        new Set(admittedLines.map((line) => line.serverConfigurationId)).size !== admittedLines.length
      ) {
        throw new Error('Could not create unique cart line relationships.');
      }

      const parentInput = admittedLines.map((line) => ({
        merchandiseId: line.merchandiseId,
        quantity: line.quantity,
        attributes: [{ key: '_bass_binge_build', value: line.serverConfigurationId }]
      }));
      const createData = await requestStorefront(
        CART_CREATE,
        { input: { lines: parentInput } },
        request
      );
      const createPayload = createData.cartCreate;
      const createFailure = mutationFailure(createPayload);

      if (createFailure || !createPayload.cart) {
        return sendJson(response, 422, {
          ok: false,
          code: 'shopify_cart_rejected',
          message: createFailure || 'Shopify could not create the cart.'
        });
      }

      let cart = createPayload.cart;
      const rattleLines = admittedLines
        .filter((line) => line.rattleMerchandiseId)
        .map((line) => {
          const parent = cart.lines.nodes.find((candidate) =>
            getConfigurationId(candidate) === line.serverConfigurationId
          );
          if (!parent) throw new Error('Created cart is missing an admitted parent line');
          return {
            merchandiseId: line.rattleMerchandiseId,
            quantity: line.quantity,
            parent: { lineId: parent.id }
          };
        });

      if (rattleLines.length) {
        const addData = await requestStorefront(
          CART_LINES_ADD,
          { cartId: cart.id, lines: rattleLines },
          request
        );
        const addPayload = addData.cartLinesAdd;
        const addFailure = mutationFailure(addPayload);
        if (addFailure || !addPayload.cart) {
          return sendJson(response, 422, {
            ok: false,
            code: 'shopify_rattle_rejected',
            message: addFailure || 'Shopify could not attach the selected rattle.'
          });
        }
        cart = addPayload.cart;
      }

      return sendJson(response, 200, {
        ok: true,
        cartId: cart.id,
        checkoutUrl: cart.checkoutUrl,
        warnings: (createPayload.warnings || []).map((warning) => warning.message)
      });
    } catch (error) {
      console.error('Shopify cart creation failed', {
        message: error.message,
        details: error.details || null
      });
      return sendJson(response, error.statusCode === 503 ? 503 : 502, {
        ok: false,
        code: 'shopify_cart_unavailable',
        message: 'Secure checkout is temporarily unavailable. Please try again.'
      });
    }
  };
}

module.exports = createShopifyCartHandler();
module.exports.createShopifyCartHandler = createShopifyCartHandler;
module.exports.normalizeLines = normalizeLines;
module.exports.PUBLIC_CART_POLICY = PUBLIC_CART_POLICY;
