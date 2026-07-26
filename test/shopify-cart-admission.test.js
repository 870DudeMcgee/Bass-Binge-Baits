'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createShopifyCartHandler } = require('../api/shopify-cart.js');

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function admittedCatalog() {
  return {
    schemaVersion: 2,
    generationId: 'generation-current',
    products: [{
      id: 'gid://shopify/Product/100',
      handle: 'ordinary-jig',
      availableForSale: true,
      presentation: { kind: 'ordinary', rattleEnabled: false },
      variants: [{
        id: 'gid://shopify/ProductVariant/1001',
        availableForSale: true,
        quantityAvailable: 10,
        price: { amount: '6.75', currencyCode: 'USD' }
      }]
    }],
    quarantine: []
  };
}

function withRattle(catalog) {
  catalog.products[0].presentation.rattleEnabled = true;
  catalog.products.push({
    id: 'gid://shopify/Product/200',
    handle: 'rattle-add-on',
    availableForSale: true,
    presentation: { kind: 'hidden-add-on', rattleEnabled: false },
    variants: [{
      id: 'gid://shopify/ProductVariant/2001',
      availableForSale: true,
      quantityAvailable: 20,
      price: { amount: '0.50', currencyCode: 'USD' }
    }]
  });
  return catalog;
}

function ordinaryLine(overrides = {}) {
  return {
    merchandiseId: 'gid://shopify/ProductVariant/1001',
    quantity: 1,
    configurationId: 'client-line',
    price: { amount: '6.75', currencyCode: 'USD' },
    ...overrides
  };
}

function cartRequest(lines, overrides = {}) {
  return {
    method: 'POST',
    headers: { host: 'bassbingebaits.com' },
    body: {
      generationId: 'generation-current',
      lines
    },
    ...overrides
  };
}

test('an arbitrary syntactically valid variant is rejected before Shopify', async () => {
  let storefrontCalls = 0;
  const handler = createShopifyCartHandler({
    getCatalog: async () => admittedCatalog(),
    storefrontRequest: async () => {
      storefrontCalls += 1;
      throw new Error('must not reach Shopify');
    }
  });
  const response = responseRecorder();

  await handler(cartRequest([{
    merchandiseId: 'gid://shopify/ProductVariant/9999',
    quantity: 1,
    configurationId: 'client-line',
    price: { amount: '6.75', currencyCode: 'USD' }
  }]), response);

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.code, 'cart_line_not_admitted');
  assert.equal(storefrontCalls, 0);
});

test('cart quantities must be positive integers no greater than 99', async (t) => {
  for (const [name, quantity] of [
    ['fractional', 2.7],
    ['NaN', Number.NaN],
    ['negative', -1],
    ['over-limit', 100]
  ]) {
    await t.test(name, async () => {
      let storefrontCalls = 0;
      const handler = createShopifyCartHandler({
        getCatalog: async () => admittedCatalog(),
        storefrontRequest: async () => {
          storefrontCalls += 1;
          throw new Error('must not reach Shopify');
        }
      });
      const response = responseRecorder();

      await handler(cartRequest([{
        merchandiseId: 'gid://shopify/ProductVariant/1001',
        quantity,
        configurationId: 'client-line',
        price: { amount: '6.75', currencyCode: 'USD' }
      }]), response);

      assert.equal(response.statusCode, 400);
      assert.equal(response.body.code, 'cart_request_invalid');
      assert.equal(storefrontCalls, 0);
    });
  }
});

test('catalog, generation, availability, money, and configuration failures stop before Shopify', async (t) => {
  const cases = [
    {
      name: 'hidden parent',
      catalog(catalog) {
        catalog.products.push({
          id: 'gid://shopify/Product/200',
          handle: 'rattle-add-on',
          availableForSale: true,
          presentation: { kind: 'hidden-add-on', rattleEnabled: false },
          variants: [{
            id: 'gid://shopify/ProductVariant/2001',
            availableForSale: true,
            quantityAvailable: 10,
            price: { amount: '0.50', currencyCode: 'USD' }
          }]
        });
        return catalog;
      },
      lines: [ordinaryLine({
        merchandiseId: 'gid://shopify/ProductVariant/2001',
        price: { amount: '0.50', currencyCode: 'USD' }
      })],
      statusCode: 422
    },
    {
      name: 'quarantined variant',
      catalog(catalog) {
        catalog.quarantine.push({
          severity: 'variant-blocked',
          variantId: 'gid://shopify/ProductVariant/1001'
        });
        return catalog;
      },
      lines: [ordinaryLine()],
      statusCode: 422
    },
    {
      name: 'quarantined product still present in a malformed envelope',
      catalog(catalog) {
        catalog.quarantine.push({
          severity: 'product-quarantined',
          productId: 'gid://shopify/Product/100'
        });
        return catalog;
      },
      lines: [ordinaryLine()],
      statusCode: 422
    },
    {
      name: 'sold-out variant',
      catalog(catalog) {
        catalog.products[0].variants[0].availableForSale = false;
        return catalog;
      },
      lines: [ordinaryLine()],
      statusCode: 422
    },
    {
      name: 'zero-inventory variant',
      catalog(catalog) {
        catalog.products[0].variants[0].quantityAvailable = 0;
        return catalog;
      },
      lines: [ordinaryLine()],
      statusCode: 422
    },
    {
      name: 'stale generation',
      catalog: (catalog) => catalog,
      body: { generationId: 'generation-old', lines: [ordinaryLine()] },
      statusCode: 409,
      code: 'cart_generation_stale'
    },
    {
      name: 'changed money',
      catalog: (catalog) => catalog,
      lines: [ordinaryLine({ price: { amount: '0.01', currencyCode: 'USD' } })],
      statusCode: 422
    },
    {
      name: 'wrong currency',
      catalog: (catalog) => catalog,
      lines: [ordinaryLine({ price: { amount: '6.75', currencyCode: 'CAD' } })],
      statusCode: 422
    },
    {
      name: 'duplicate client configuration IDs',
      catalog: (catalog) => catalog,
      lines: [
        ordinaryLine(),
        ordinaryLine({ configurationId: 'client-line' })
      ],
      statusCode: 400,
      code: 'cart_request_invalid'
    }
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      let storefrontCalls = 0;
      const catalog = scenario.catalog(admittedCatalog());
      const handler = createShopifyCartHandler({
        getCatalog: async () => catalog,
        storefrontRequest: async () => {
          storefrontCalls += 1;
          throw new Error('must not reach Shopify');
        }
      });
      const response = responseRecorder();
      const request = cartRequest(scenario.lines || []);
      if (scenario.body) request.body = scenario.body;

      await handler(request, response);

      assert.equal(response.statusCode, scenario.statusCode);
      assert.equal(response.body.code, scenario.code || 'cart_line_not_admitted');
      assert.equal(storefrontCalls, 0);
    });
  }
});

test('wrong or ineligible rattle children are rejected before Shopify', async (t) => {
  for (const scenario of [
    {
      name: 'wrong child',
      catalog: withRattle(admittedCatalog()),
      rattleMerchandiseId: 'gid://shopify/ProductVariant/9998'
    },
    {
      name: 'ineligible parent',
      catalog: (() => {
        const catalog = withRattle(admittedCatalog());
        catalog.products[0].presentation.rattleEnabled = false;
        return catalog;
      })(),
      rattleMerchandiseId: 'gid://shopify/ProductVariant/2001'
    }
  ]) {
    await t.test(scenario.name, async () => {
      let storefrontCalls = 0;
      const handler = createShopifyCartHandler({
        getCatalog: async () => scenario.catalog,
        storefrontRequest: async () => {
          storefrontCalls += 1;
          throw new Error('must not reach Shopify');
        }
      });
      const response = responseRecorder();

      await handler(cartRequest([
        ordinaryLine({ rattleMerchandiseId: scenario.rattleMerchandiseId })
      ]), response);

      assert.equal(response.statusCode, 422);
      assert.equal(response.body.code, 'cart_line_not_admitted');
      assert.equal(storefrontCalls, 0);
    });
  }
});

test('a valid missing-Origin ordinary cart uses a server-owned relationship and Shopify checkout URL', async () => {
  const requests = [];
  const handler = createShopifyCartHandler({
    getCatalog: async () => admittedCatalog(),
    createConfigurationId: () => 'server-configuration-1',
    storefrontRequest: async (query, variables) => {
      requests.push({ query, variables });
      return {
        cartCreate: {
          cart: {
            id: 'gid://shopify/Cart/1',
            checkoutUrl: 'https://checkout.shopify.com/ordinary',
            lines: { nodes: [] }
          },
          userErrors: [],
          warnings: []
        }
      };
    }
  });
  const response = responseRecorder();

  await handler(cartRequest([ordinaryLine({ quantity: 2 })]), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.checkoutUrl, 'https://checkout.shopify.com/ordinary');
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].variables.input.lines, [{
    merchandiseId: 'gid://shopify/ProductVariant/1001',
    quantity: 2,
    attributes: [{
      key: '_bass_binge_build',
      value: 'server-configuration-1'
    }]
  }]);
});

test('a valid rattle cart nests the admitted child beneath its exact parent', async () => {
  const requests = [];
  const handler = createShopifyCartHandler({
    getCatalog: async () => withRattle(admittedCatalog()),
    createConfigurationId: () => 'server-configuration-1',
    storefrontRequest: async (query, variables) => {
      requests.push({ query, variables });
      if (requests.length === 1) {
        return {
          cartCreate: {
            cart: {
              id: 'gid://shopify/Cart/2',
              checkoutUrl: 'https://checkout.shopify.com/parent',
              lines: {
                nodes: [{
                  id: 'gid://shopify/CartLine/parent-1',
                  merchandise: { id: 'gid://shopify/ProductVariant/1001' },
                  quantity: 3,
                  attributes: [{
                    key: '_bass_binge_build',
                    value: 'server-configuration-1'
                  }]
                }]
              }
            },
            userErrors: [],
            warnings: []
          }
        };
      }
      return {
        cartLinesAdd: {
          cart: {
            id: 'gid://shopify/Cart/2',
            checkoutUrl: 'https://checkout.shopify.com/rattle',
            lines: { nodes: [] }
          },
          userErrors: [],
          warnings: []
        }
      };
    }
  });
  const response = responseRecorder();

  await handler(cartRequest([ordinaryLine({
    quantity: 3,
    rattleMerchandiseId: 'gid://shopify/ProductVariant/2001'
  })]), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.checkoutUrl, 'https://checkout.shopify.com/rattle');
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].variables.input.lines, [{
    merchandiseId: 'gid://shopify/ProductVariant/1001',
    quantity: 3,
    attributes: [{
      key: '_bass_binge_build',
      value: 'server-configuration-1'
    }]
  }]);
  assert.deepEqual(requests[1].variables, {
    cartId: 'gid://shopify/Cart/2',
    lines: [{
      merchandiseId: 'gid://shopify/ProductVariant/2001',
      quantity: 3,
      parent: { lineId: 'gid://shopify/CartLine/parent-1' }
    }]
  });
});

test('the public cart endpoint rejects requests beyond its 50-line limit before admission', async () => {
  let catalogCalls = 0;
  let storefrontCalls = 0;
  const handler = createShopifyCartHandler({
    getCatalog: async () => {
      catalogCalls += 1;
      return admittedCatalog();
    },
    storefrontRequest: async () => {
      storefrontCalls += 1;
      throw new Error('must not reach Shopify');
    }
  });
  const response = responseRecorder();

  await handler(cartRequest(Array.from({ length: 51 }, (_, index) =>
    ordinaryLine({ configurationId: `client-line-${index}` })
  )), response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.code, 'cart_request_invalid');
  assert.equal(catalogCalls, 0);
  assert.equal(storefrontCalls, 0);
});
