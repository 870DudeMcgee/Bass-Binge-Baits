'use strict';

const { storefrontRequest } = require('../lib/shopify-storefront.js');

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
  if (!origin || !host) return true;
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
  if (!rawLines.length || rawLines.length > 50) return null;

  const normalized = rawLines.map((line, index) => ({
    merchandiseId: String(line && line.merchandiseId || ''),
    rattleMerchandiseId: line && line.rattleMerchandiseId
      ? String(line.rattleMerchandiseId)
      : null,
    quantity: Math.max(1, Math.min(99, Number(line && line.quantity) || 1)),
    configurationId: String(line && line.configurationId || `line-${index}`).slice(0, 120),
    price: normalizeMoney(line && line.price)
  }));

  if (normalized.some((line) =>
    !isVariantGid(line.merchandiseId) ||
    !line.price ||
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

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { ok: false, message: 'Method not allowed.' });
  }

  if (!isSameOrigin(request)) {
    return sendJson(response, 403, { ok: false, message: 'Request origin is not allowed.' });
  }

  const lines = normalizeLines(request.body);
  if (!lines) {
    return sendJson(response, 400, { ok: false, message: 'Cart lines are invalid.' });
  }

  try {
    const parentInput = lines.map((line) => ({
      merchandiseId: line.merchandiseId,
      quantity: line.quantity,
      attributes: [{ key: '_bass_binge_build', value: line.configurationId }]
    }));
    const createData = await storefrontRequest(CART_CREATE, { input: { lines: parentInput } }, request);
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
    const rattleLines = lines.filter((line) => line.rattleMerchandiseId).map((line) => {
      const parent = cart.lines.nodes.find((candidate) =>
        getConfigurationId(candidate) === line.configurationId
      );
      if (!parent) throw new Error(`Created cart is missing parent ${line.configurationId}`);
      return {
        merchandiseId: line.rattleMerchandiseId,
        quantity: line.quantity,
        parent: { lineId: parent.id }
      };
    });

    if (rattleLines.length) {
      const addData = await storefrontRequest(
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
    return sendJson(response, 502, {
      ok: false,
      code: 'shopify_cart_unavailable',
      message: 'Secure checkout is temporarily unavailable. Please try again.'
    });
  }
};

module.exports.normalizeLines = normalizeLines;
