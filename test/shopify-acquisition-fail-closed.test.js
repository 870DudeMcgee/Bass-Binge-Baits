'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const fixtures = require('./fixtures/catalog-envelope-v2.json');
const { createMemoryCatalogStore } = require('../lib/catalog-durable-store.js');
const { createCatalogService } = require('../lib/catalog-freshness.js');
const { loadFreshCatalog } = require('../lib/shopify-catalog.js');

function fixtureProduct(overrides = {}) {
  return Object.assign(structuredClone(fixtures.colorOnly), overrides);
}

function productPage(product = fixtureProduct()) {
  return {
    products: {
      edges: [{ cursor: 'product-1', node: product }],
      pageInfo: { hasNextPage: false, endCursor: 'product-1' }
    }
  };
}

async function assertAcquisitionRejects(data) {
  await assert.rejects(
    loadFreshCatalog({ headers: {} }, {
      authenticated: false,
      storefrontRequest: async () => data,
      logger: { warn() {} }
    }),
    /Shopify returned a malformed/
  );
}

test('loadFreshCatalog rejects malformed product connection pages before normalization', async (t) => {
  const cases = [
    ['missing connection', {}],
    ['missing edges', { products: { pageInfo: { hasNextPage: false, endCursor: null } } }],
    ['missing pageInfo', { products: { edges: [] } }],
    ['invalid hasNextPage boolean', {
      products: { edges: [], pageInfo: { hasNextPage: 'false', endCursor: null } }
    }],
    ['missing edge cursor', {
      products: {
        edges: [{ node: fixtureProduct() }],
        pageInfo: { hasNextPage: false, endCursor: null }
      }
    }],
    ['missing edge node', {
      products: {
        edges: [{ cursor: 'product-1', node: null }],
        pageInfo: { hasNextPage: false, endCursor: 'product-1' }
      }
    }],
    ['repeated edge cursor', {
      products: {
        edges: [
          { cursor: 'product-1', node: fixtureProduct() },
          { cursor: 'product-1', node: fixtureProduct({ id: 'gid://shopify/Product/102' }) }
        ],
        pageInfo: { hasNextPage: false, endCursor: 'product-1' }
      }
    }]
  ];

  for (const [name, data] of cases) {
    await t.test(name, () => assertAcquisitionRejects(data));
  }
});

test('loadFreshCatalog rejects variant and media continuations for a different product', async (t) => {
  for (const kind of ['variants', 'media']) {
    await t.test(kind, async () => {
      const product = fixtureProduct();
      product[kind].pageInfo = { hasNextPage: true, endCursor: `${kind}-page-1` };

      await assert.rejects(
        loadFreshCatalog({ headers: {} }, {
          authenticated: false,
          logger: { warn() {} },
          storefrontRequest: async (query) => {
            if (query.includes('BassBingeProductVariantsPage')) {
              return {
                product: {
                  id: 'gid://shopify/Product/999',
                  variants: {
                    nodes: [],
                    pageInfo: { hasNextPage: false, endCursor: null }
                  }
                }
              };
            }
            if (query.includes('BassBingeProductMediaPage')) {
              return {
                product: {
                  id: 'gid://shopify/Product/999',
                  media: {
                    nodes: [],
                    pageInfo: { hasNextPage: false, endCursor: null }
                  }
                }
              };
            }
            return productPage(product);
          }
        }),
        /Shopify returned an inconsistent/
      );
    });
  }
});

test('loadFreshCatalog rejects product pageInfo cursors inconsistent with returned edges', async (t) => {
  const cases = [
    ['nonempty page', {
      products: {
        edges: [{ cursor: 'product-1', node: fixtureProduct() }],
        pageInfo: { hasNextPage: false, endCursor: 'different-product' }
      }
    }],
    ['empty page', {
      products: {
        edges: [],
        pageInfo: { hasNextPage: false, endCursor: 'phantom-product' }
      }
    }]
  ];

  for (const [name, data] of cases) {
    await t.test(name, async () => {
      await assert.rejects(
        loadFreshCatalog({ headers: {} }, {
          authenticated: false,
          storefrontRequest: async () => data,
          logger: { warn() {} }
        }),
        /Shopify returned an inconsistent product continuation/
      );
    });
  }
});

test('loadFreshCatalog never retries authenticated transient or general GraphQL failures with the reduced query', async (t) => {
  const failures = [
    ['timeout', Object.assign(new Error('timed out'), { name: 'TimeoutError' })],
    ['429', Object.assign(new Error('rate limited'), { statusCode: 429 })],
    ['429 with permission-shaped payload', Object.assign(new Error('rate limited'), {
      statusCode: 429,
      details: [{
        message: 'Access denied for tags field.',
        path: ['products', 'edges', 0, 'node', 'tags'],
        extensions: { code: 'ACCESS_DENIED' }
      }]
    })],
    ['5xx', Object.assign(new Error('upstream failed'), { statusCode: 503 })],
    ['transport', Object.assign(new Error('socket reset'), { code: 'ECONNRESET' })],
    ['general GraphQL', Object.assign(new Error('query failed'), {
      statusCode: 502,
      details: [{
        message: 'Internal error',
        extensions: { code: 'INTERNAL_SERVER_ERROR' }
      }]
    })]
  ];

  for (const [name, failure] of failures) {
    await t.test(name, async () => {
      let calls = 0;
      await assert.rejects(
        loadFreshCatalog({ headers: {} }, {
          authenticated: true,
          logger: { warn() {} },
          storefrontRequest: async () => {
            calls += 1;
            if (calls === 1) throw failure;
            return productPage();
          }
        }),
        (error) => error === failure
      );
      assert.equal(calls, 1);
    });
  }
});

test('an explicit authenticated-field permission failure cannot admit classification-blind products', async () => {
  const permissionFailure = Object.assign(new Error('query failed'), {
    statusCode: 502,
    details: [{
      message: 'Access denied for tags field.',
      path: ['products', 'edges', 0, 'node', 'tags'],
      extensions: { code: 'ACCESS_DENIED' }
    }]
  });
  const tagOnlyDrop = fixtureProduct({
    id: 'gid://shopify/Product/201',
    handle: 'tag-only-drop',
    productType: 'Jig'
  });
  delete tagOnlyDrop.tags;
  const tagOnlyHiddenAddOn = fixtureProduct({
    id: 'gid://shopify/Product/202',
    handle: 'tag-only-hidden-add-on',
    productType: 'Accessory'
  });
  delete tagOnlyHiddenAddOn.tags;
  let calls = 0;

  await assert.rejects(
    loadFreshCatalog({ headers: {} }, {
      authenticated: true,
      logger: { warn() {} },
      storefrontRequest: async () => {
        calls += 1;
        if (calls === 1) throw permissionFailure;
        return {
          products: {
            edges: [
              { cursor: 'product-201', node: tagOnlyDrop },
              { cursor: 'product-202', node: tagOnlyHiddenAddOn }
            ],
            pageInfo: { hasNextPage: false, endCursor: 'product-202' }
          }
        };
      }
    }),
    (error) => error.code === 'shopify_catalog_classification_unavailable'
  );
  assert.equal(calls, 2);
});

test('an explicit authenticated-field permission failure may prove an empty catalog with the reduced query', async () => {
  const permissionFailure = Object.assign(new Error('query failed'), {
    statusCode: 502,
    details: [{
      message: 'Access denied for metafields field.',
      path: ['products', 'edges', 0, 'node', 'metafields'],
      extensions: { code: 'ACCESS_DENIED' }
    }]
  });
  const queries = [];

  const envelope = await loadFreshCatalog({ headers: {} }, {
    authenticated: true,
    generatedAt: '2026-07-26T18:00:00.000Z',
    logger: { warn() {} },
    storefrontRequest: async (query) => {
      queries.push(query);
      if (queries.length === 1) throw permissionFailure;
      return {
        products: {
          edges: [],
          pageInfo: { hasNextPage: false, endCursor: null }
        }
      };
    }
  });

  assert.equal(queries.length, 2);
  assert.match(queries[0], /\btags\b/);
  assert.doesNotMatch(queries[1], /\btags\b/);
  assert.deepEqual(envelope.products, []);
});

test('loadFreshCatalog rejects malformed variant and media connection matrices', async (t) => {
  const malformedConnections = [
    ['missing connection', null],
    ['missing nodes', { pageInfo: { hasNextPage: false, endCursor: null } }],
    ['missing pageInfo', { nodes: [] }],
    ['invalid hasNextPage boolean', {
      nodes: [],
      pageInfo: { hasNextPage: 0, endCursor: null }
    }],
    ['missing continuation cursor', {
      nodes: [],
      pageInfo: { hasNextPage: true, endCursor: null }
    }],
    ['missing node', {
      nodes: [null],
      pageInfo: { hasNextPage: false, endCursor: null }
    }]
  ];

  for (const kind of ['variants', 'media']) {
    for (const [name, connection] of malformedConnections) {
      await t.test(`${kind}: initial ${name}`, async () => {
        const product = fixtureProduct();
        product[kind] = connection;
        await assertAcquisitionRejects(productPage(product));
      });
    }

    for (const [name, connection] of malformedConnections) {
      await t.test(`${kind}: continuation ${name}`, async () => {
        const product = fixtureProduct();
        product[kind].pageInfo = { hasNextPage: true, endCursor: `${kind}-page-1` };
        await assert.rejects(
          loadFreshCatalog({ headers: {} }, {
            authenticated: false,
            logger: { warn() {} },
            storefrontRequest: async (query) => {
              if (
                query.includes('BassBingeProductVariantsPage') ||
                query.includes('BassBingeProductMediaPage')
              ) {
                return {
                  product: {
                    id: product.id,
                    [kind]: connection
                  }
                };
              }
              return productPage(product);
            }
          }),
          /Shopify returned a malformed/
        );
      });
    }

    await t.test(`${kind}: repeated continuation cursor`, async () => {
      const product = fixtureProduct();
      product[kind].pageInfo = { hasNextPage: true, endCursor: `${kind}-page-1` };
      await assert.rejects(
        loadFreshCatalog({ headers: {} }, {
          authenticated: false,
          logger: { warn() {} },
          storefrontRequest: async (query) => {
            if (
              query.includes('BassBingeProductVariantsPage') ||
              query.includes('BassBingeProductMediaPage')
            ) {
              return {
                product: {
                  id: product.id,
                  [kind]: {
                    nodes: [],
                    pageInfo: { hasNextPage: true, endCursor: `${kind}-page-1` }
                  }
                }
              };
            }
            return productPage(product);
          }
        }),
        /continuation cursor was repeated/
      );
    });
  }
});

test('loadFreshCatalog rejects malformed product continuation pages', async (t) => {
  const malformedPages = [
    ['missing connection', {}],
    ['missing edges', {
      products: { pageInfo: { hasNextPage: false, endCursor: null } }
    }],
    ['missing pageInfo', { products: { edges: [] } }],
    ['invalid hasNextPage boolean', {
      products: { edges: [], pageInfo: { hasNextPage: 'false', endCursor: null } }
    }],
    ['missing continuation cursor', {
      products: { edges: [], pageInfo: { hasNextPage: true, endCursor: null } }
    }],
    ['missing edge cursor', {
      products: {
        edges: [{ node: fixtureProduct({ id: 'gid://shopify/Product/203' }) }],
        pageInfo: { hasNextPage: false, endCursor: null }
      }
    }],
    ['missing edge node', {
      products: {
        edges: [{ cursor: 'product-2', node: null }],
        pageInfo: { hasNextPage: false, endCursor: 'product-2' }
      }
    }]
  ];

  for (const [name, malformedPage] of malformedPages) {
    await t.test(name, async () => {
      const firstPage = productPage();
      firstPage.products.pageInfo.hasNextPage = true;
      await assert.rejects(
        loadFreshCatalog({ headers: {} }, {
          authenticated: false,
          logger: { warn() {} },
          storefrontRequest: async (_query, variables) =>
            variables.after ? malformedPage : firstPage
        }),
        /Shopify returned a malformed/
      );
    });
  }

  await t.test('repeated continuation cursor', async () => {
    const firstPage = productPage();
    firstPage.products.pageInfo.hasNextPage = true;
    await assert.rejects(
      loadFreshCatalog({ headers: {} }, {
        authenticated: false,
        logger: { warn() {} },
        storefrontRequest: async (_query, variables) => variables.after
          ? {
              products: {
                edges: [{
                  cursor: 'product-1',
                  node: fixtureProduct({ id: 'gid://shopify/Product/203' })
                }],
                pageInfo: { hasNextPage: true, endCursor: 'product-1' }
              }
            }
          : firstPage
      }),
      /cursor was repeated/
    );
  });
});

test('authenticated transient failure cannot replace prior truth with a tag-only timing-invalid drop', async () => {
  const namespace = 'test:c2:retain-prior';
  const store = createMemoryCatalogStore();
  const priorEnvelope = {
    schemaVersion: 2,
    generationId: 'generation-prior',
    generatedAt: '2026-07-26T12:00:00.000Z',
    sourceUpdatedAt: '2026-07-26T12:00:00.000Z',
    freshness: { status: 'fresh', ageSeconds: 0, ttlSeconds: 0.01 },
    products: [],
    quarantine: [{
      code: 'prior-quarantine',
      severity: 'warning',
      observedAt: '2026-07-26T12:00:00.000Z'
    }],
    outcomes: {
      accepted: [],
      warning: [],
      variantBlocked: [],
      productQuarantined: []
    },
    legacy: { products: [], errors: [] }
  };
  const tagOnlyTimingInvalidDrop = fixtureProduct({
    id: 'gid://shopify/Product/204',
    handle: 'tag-only-timing-invalid-drop',
    productType: 'Jig',
    tags: ['limited-drop'],
    metafields: [
      {
        namespace: 'bass_binge',
        key: 'drop_starts_at',
        value: 'not-a-date',
        type: 'date_time'
      }
    ]
  });
  const reducedDrop = structuredClone(tagOnlyTimingInvalidDrop);
  delete reducedDrop.tags;
  delete reducedDrop.metafields;
  const transientFailure = Object.assign(new Error('rate limited'), { statusCode: 429 });
  let observedAt = 0;
  let loads = 0;
  let storefrontCalls = 0;
  const service = createCatalogService({
    namespace,
    store,
    now: () => observedAt,
    ttlMs: 10,
    staleMs: 100,
    createId: (() => {
      let id = 0;
      return () => `id-${++id}`;
    })(),
    loadCatalog: async () => {
      loads += 1;
      if (loads === 1) return structuredClone(priorEnvelope);
      return loadFreshCatalog({ headers: {} }, {
        authenticated: true,
        logger: { warn() {} },
        storefrontRequest: async () => {
          storefrontCalls += 1;
          if (storefrontCalls === 1) throw transientFailure;
          return {
            products: {
              edges: [{ cursor: 'product-204', node: reducedDrop }],
              pageInfo: { hasNextPage: false, endCursor: 'product-204' }
            }
          };
        }
      });
    }
  });

  await service.getCatalog({ headers: {} });
  observedAt = 20;
  const stale = await service.getCatalog({ headers: {} });
  const durable = await store.get(`${namespace}:envelope`);

  assert.equal(stale.generationId, 'generation-prior');
  assert.equal(stale.quarantine[0].code, 'prior-quarantine');
  assert.equal(storefrontCalls, 1);
  assert.equal(durable.envelope.generationId, 'generation-prior');
  assert.deepEqual(durable.envelope.quarantine, priorEnvelope.quarantine);
});
