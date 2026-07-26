'use strict';

const { createRedisCatalogStore } = require('../../lib/catalog-durable-store.js');
const { createCatalogService } = require('../../lib/catalog-freshness.js');

async function main() {
  const mode = process.argv[2];
  const url = process.argv[3];
  let nextId = 0;
  const service = createCatalogService({
    store: createRedisCatalogStore({
      url,
      token: 'fixture-token',
      allowInsecureLocalhost: true
    }),
    createId: () => `${mode}-${++nextId}`,
    loadCatalog: async (request, options) => {
      if (mode !== 'writer') throw new Error('reader process must use shared state');
      return {
        ok: true,
        source: 'shopify',
        schemaVersion: 2,
        generationId: options.generationId,
        generatedAt: options.generatedAt,
        sourceUpdatedAt: '2026-07-26T16:00:00.000Z',
        requestId: options.requestId,
        freshness: { status: 'fresh', ageSeconds: 0, ttlSeconds: 45 },
        stale: false,
        products: [],
        quarantine: [],
        outcomes: {
          accepted: [],
          warning: [],
          variantBlocked: [],
          productQuarantined: []
        },
        legacy: { ok: true, products: [], errors: [] }
      };
    }
  });
  const catalog = await service.getCatalog({ headers: {} });
  process.stdout.write(JSON.stringify({
    pid: process.pid,
    generationId: catalog.generationId,
    generatedAt: catalog.generatedAt,
    lastSuccessfulRefreshAt: catalog.lastSuccessfulRefreshAt,
    cache: catalog.cache
  }));
}

main().catch((error) => {
  process.stderr.write(error.stack || error.message);
  process.exitCode = 1;
});
