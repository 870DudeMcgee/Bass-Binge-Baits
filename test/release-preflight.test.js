'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const preflight = path.join(root, 'scripts', 'release-preflight.js');

function runPreflight(options = {}) {
  return spawnSync(process.execPath, [
    preflight,
    '--root',
    options.root || root,
    '--expected-head',
    options.expectedHead || '0000000000000000000000000000000000000000'
  ], {
    cwd: root,
    encoding: 'utf8',
    env: options.env || {}
  });
}

function git(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Release Preflight Test',
      GIT_AUTHOR_EMAIL: 'release-preflight@example.invalid',
      GIT_COMMITTER_NAME: 'Release Preflight Test',
      GIT_COMMITTER_EMAIL: 'release-preflight@example.invalid'
    }
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function createFixtureRepository(options = {}) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'release-preflight-'));
  fs.mkdirSync(path.join(fixtureRoot, 'scripts'));
  fs.writeFileSync(path.join(fixtureRoot, 'vercel.json'), JSON.stringify({
    crons: [{
      path: '/api/catalog-reconcile',
      schedule: options.cron || '0 0 * * *'
    }]
  }));
  fs.writeFileSync(
    path.join(fixtureRoot, 'scripts', 'validate-shopify-integration.js'),
    options.strictScript || `process.exit(${options.strictFailure ? 1 : 0});\n`
  );
  git(fixtureRoot, ['init', '-q']);
  git(fixtureRoot, ['add', 'vercel.json', 'scripts/validate-shopify-integration.js']);
  git(fixtureRoot, ['commit', '-qm', 'fixture']);
  return {
    root: fixtureRoot,
    head: git(fixtureRoot, ['rev-parse', 'HEAD'])
  };
}

function completeEnvironment(overrides = {}) {
  return {
    PATH: process.env.PATH,
    SHOPIFY_STORE_DOMAIN: 'synthetic-shop.myshopify.com',
    SHOPIFY_STOREFRONT_PRIVATE_TOKEN: 'synthetic-private-token-7f4a',
    SHOPIFY_WEBHOOK_SECRET: 'synthetic-webhook-secret-9c2b',
    CATALOG_HEALTH_TOKEN: 'synthetic-health-token-6d1e',
    CRON_SECRET: 'synthetic-cron-secret-3a8f',
    KV_REST_API_URL: 'https://synthetic-cache.upstash.io',
    KV_REST_API_TOKEN: 'synthetic-cache-token-4b7d',
    VERCEL_ENV: 'production',
    VERCEL_PROJECT_PRODUCTION_URL: 'store.synthetic.invalid',
    ...overrides
  };
}

test('missing required configuration is reported by name without exposing adjacent values', () => {
  const adjacentSecret = 'adjacent-secret-must-never-appear';
  const fixture = createFixtureRepository({
    strictScript: 'console.log(process.env.ADJACENT_SECRET); process.exit(1);\n'
  });
  const result = runPreflight({
    root: fixture.root,
    expectedHead: fixture.head,
    env: {
      PATH: process.env.PATH,
      ADJACENT_SECRET: adjacentSecret
    }
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 1);
  assert.match(output, /STATE: BLOCKED/);
  assert.match(output, /SHOPIFY_STOREFRONT_PRIVATE_TOKEN/);
  assert.match(output, /SHOPIFY_WEBHOOK_SECRET/);
  assert.match(output, /CATALOG_HEALTH_TOKEN/);
  assert.match(output, /CRON_SECRET/);
  assert.doesNotMatch(output, new RegExp(adjacentSecret));
});

test('placeholder configuration blocks readiness', () => {
  const fixture = createFixtureRepository();
  const result = runPreflight({
    root: fixture.root,
    expectedHead: fixture.head,
    env: completeEnvironment({
      SHOPIFY_WEBHOOK_SECRET: 'placeholder'
    })
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /STATE: BLOCKED/);
  assert.match(
    result.stdout,
    /\[CORE_CONFIGURATION\] MISSING_OR_INVALID: SHOPIFY_WEBHOOK_SECRET/
  );
  assert.doesNotMatch(result.stdout, /placeholder/);
});

test('durable URLs must use HTTPS and manual namespace aliases are rejected', async (t) => {
  const fixture = createFixtureRepository();
  const cases = [
    {
      name: 'non-HTTPS durable URL',
      environment: completeEnvironment({
        KV_REST_API_URL: 'http://synthetic-cache.invalid'
      }),
      expectedName: 'KV_REST_API_URL'
    },
    {
      name: 'manual namespace alias',
      environment: completeEnvironment({
        CATALOG_CACHE_NAMESPACE: 'shared-alias'
      }),
      expectedName: 'CATALOG_CACHE_NAMESPACE'
    }
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const result = runPreflight({
        root: fixture.root,
        expectedHead: fixture.head,
        env: scenario.environment
      });

      assert.equal(result.status, 1);
      assert.match(result.stdout, /STATE: BLOCKED/);
      assert.match(result.stdout, new RegExp(
        `\\] MISSING_OR_INVALID: ${scenario.expectedName}`
      ));
    });
  }
});

test('wrong cron, dirty release state, and failed strict Shopify validation block', async (t) => {
  const cases = [
    {
      name: 'wrong cron',
      fixture: createFixtureRepository({ cron: '0 * * * *' }),
      expectedName: 'VERCEL_HOBBY_CRON'
    },
    {
      name: 'failed strict Shopify validation',
      fixture: createFixtureRepository({ strictFailure: true }),
      expectedName: 'STRICT_SHOPIFY_VALIDATION'
    }
  ];
  const dirtyFixture = createFixtureRepository();
  fs.writeFileSync(path.join(dirtyFixture.root, 'untracked.txt'), 'dirty\n');
  cases.push({
    name: 'dirty release tree',
    fixture: dirtyFixture,
    expectedName: 'CLEAN_WORKTREE'
  });

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const result = runPreflight({
        root: scenario.fixture.root,
        expectedHead: scenario.fixture.head,
        env: completeEnvironment()
      });

      assert.equal(result.status, 1);
      assert.match(result.stdout, /STATE: BLOCKED/);
      assert.match(result.stdout, new RegExp(
        `\\] MISSING_OR_INVALID: ${scenario.expectedName}`
      ));
    });
  }
});

test('contact delivery is reported separately from core commerce readiness', () => {
  const fixture = createFixtureRepository();
  const result = runPreflight({
    root: fixture.root,
    expectedHead: fixture.head,
    env: completeEnvironment()
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /STATE: READY_LOCAL/);
  assert.match(
    result.stdout,
    /\[CONTACT_DELIVERY\] MISSING_OR_INVALID: RESEND_API_KEY/
  );
  assert.match(
    result.stdout,
    /\[CORE_CONFIGURATION\] PASS: SHOPIFY_STOREFRONT_PRIVATE_TOKEN/
  );
});

test('a complete synthetic environment reaches READY_LOCAL without an external gate', () => {
  const fixture = createFixtureRepository();
  const result = runPreflight({
    root: fixture.root,
    expectedHead: fixture.head,
    env: completeEnvironment({
      RESEND_API_KEY: 'synthetic-resend-key-5e2c',
      CONTACT_FROM_EMAIL: 'sender@synthetic.invalid',
      CONTACT_TO_EMAIL: 'recipient@synthetic.invalid'
    })
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /STATE: READY_LOCAL/);
  assert.doesNotMatch(result.stdout, /STATE: READY_TO_PUSH/);
  assert.match(
    result.stdout,
    /\[EXTERNAL_RELEASE_GATES\] MISSING_OR_INVALID: EXTERNAL_GATE/
  );
});

test('secret-free external evidence bound to the commit can reach READY_TO_PUSH', () => {
  const fixture = createFixtureRepository();
  const gateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-gate-'));
  const gatePath = path.join(gateDirectory, 'external-gate.json');
  const configuredNames = [
    'SHOPIFY_STORE_DOMAIN',
    'SHOPIFY_STOREFRONT_PRIVATE_TOKEN',
    'SHOPIFY_WEBHOOK_SECRET',
    'CATALOG_HEALTH_TOKEN',
    'CRON_SECRET',
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN',
    'RESEND_API_KEY',
    'CONTACT_FROM_EMAIL',
    'CONTACT_TO_EMAIL',
    'VERCEL_ENV'
  ];
  fs.writeFileSync(gatePath, JSON.stringify({
    schemaVersion: 1,
    head: fixture.head,
    shopifyCatalogReadiness: 'accepted',
    contactDelivery: 'configured',
    configuration: {
      production: [...configuredNames, 'VERCEL_PROJECT_PRODUCTION_URL'],
      preview: [...configuredNames, 'VERCEL_DEPLOYMENT_ID']
    }
  }));

  const result = spawnSync(process.execPath, [
    preflight,
    '--root',
    fixture.root,
    '--expected-head',
    fixture.head,
    '--external-gate',
    gatePath
  ], {
    cwd: root,
    encoding: 'utf8',
    env: completeEnvironment({
      RESEND_API_KEY: 'synthetic-resend-key-5e2c',
      CONTACT_FROM_EMAIL: 'sender@synthetic.invalid',
      CONTACT_TO_EMAIL: 'recipient@synthetic.invalid'
    })
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /STATE: READY_TO_PUSH/);
  assert.match(
    result.stdout,
    /\[EXTERNAL_RELEASE_GATES\] PASS: EXTERNAL_GATE/
  );
});
