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
  fs.mkdirSync(path.join(fixtureRoot, '.vercel'));
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
  fs.writeFileSync(
    path.join(fixtureRoot, '.vercel', 'project.json'),
    JSON.stringify({ projectName: 'synthetic-project' })
  );
  fs.writeFileSync(
    path.join(fixtureRoot, 'sitemap.xml'),
    '<urlset><url><loc>https://store.synthetic.test/</loc></url></urlset>\n'
  );
  git(fixtureRoot, ['init', '-q', '-b', 'main']);
  git(fixtureRoot, [
    'add',
    'vercel.json',
    'scripts/validate-shopify-integration.js',
    '.vercel/project.json',
    'sitemap.xml'
  ]);
  git(fixtureRoot, ['commit', '-qm', 'fixture']);
  git(fixtureRoot, [
    'update-ref',
    'refs/remotes/origin/main',
    git(fixtureRoot, ['rev-parse', 'HEAD'])
  ]);
  git(fixtureRoot, ['commit', '--allow-empty', '-qm', 'release']);
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

function completeReleaseReadinessEvidence(head) {
  return [
    {
      name: 'COMMITTED_SLICE_SET',
      status: 'accepted',
      head,
      details: { commits: [head], omittedFiles: 'none' }
    },
    {
      name: 'LOCAL_TEST_SUITE',
      status: 'passed',
      head,
      details: { command: 'node --test test/*.test.js' }
    },
    {
      name: 'CATALOG_VALIDATION',
      status: 'passed',
      head,
      details: { command: 'node scripts/validate-catalog.js' }
    },
    {
      name: 'RELEASE_AUDIT',
      status: 'passed',
      head,
      details: { command: 'node scripts/audit-release.js' }
    },
    {
      name: 'DEPENDENCY_AUDIT',
      status: 'passed',
      head,
      details: { command: 'npm audit --omit=dev' }
    },
    {
      name: 'VERCEL_PROJECT',
      status: 'confirmed',
      head,
      details: { project: 'synthetic-project' }
    },
    {
      name: 'RELEASE_BRANCH',
      status: 'confirmed',
      head,
      details: { branch: 'main' }
    },
    {
      name: 'PRODUCTION_DOMAINS',
      status: 'confirmed',
      head,
      details: {
        domains: ['store.synthetic.test'],
        source: 'vercel-project-inspection'
      }
    },
    {
      name: 'ENVIRONMENT_ASSIGNMENTS',
      status: 'confirmed',
      head,
      details: { targets: ['production', 'preview'] }
    },
    {
      name: 'AUTOMATIC_PRODUCTION_DEPLOYMENT',
      status: 'confirmed',
      head,
      details: {
        trigger: 'push-to-main',
        manualRedeploy: false
      }
    },
    {
      name: 'C8_A1_CHECKLIST',
      status: 'written',
      head,
      details: {
        location: 'docs/shopify-universal-ingestion-remediation-plan.md#c8-a1'
      }
    },
    {
      name: 'OBSERVER',
      status: 'assigned',
      head,
      details: { assignment: 'synthetic-release-observer' }
    },
    {
      name: 'ROLLBACK_DECISION',
      status: 'recorded',
      head,
      details: { decision: 'hold-on-acceptance-failure' }
    }
  ];
}

function writeExternalGate(head, overrides = {}) {
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
    schemaVersion: 2,
    head,
    shopifyCatalogReadiness: {
      status: 'accepted',
      head,
      details: {
        handle: 'heartlander-peewee-football-hd',
        title: '5/8 oz PeeWee Football HD — Heartlander',
        price: { amount: '5.99', currencyCode: 'USD' },
        variantId: 'gid://shopify/ProductVariant/1234567890',
        mediaCount: 5,
        optionTuple: [
          { name: 'Color', value: 'Heartlander' },
          { name: 'Weight', value: '5/8 oz' }
        ],
        productStatus: 'active',
        headlessPublication: 'published',
        dropWindow: {
          startsAt: '2026-08-01T12:00:00.000Z',
          endsAt: '2026-08-08T12:00:00.000Z'
        },
        inventoryDecision: { mode: 'leave-zero' }
      }
    },
    contactDelivery: 'configured',
    configuration: {
      production: [...configuredNames, 'VERCEL_PROJECT_PRODUCTION_URL'],
      preview: [...configuredNames, 'VERCEL_DEPLOYMENT_ID']
    },
    releaseReadinessEvidence: completeReleaseReadinessEvidence(head),
    ...overrides
  }));
  return gatePath;
}

function runExternalPreflight(fixture, gatePath) {
  return spawnSync(process.execPath, [
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

test('each required C8-P1 evidence class is required for READY_TO_PUSH', async (t) => {
  const fixture = createFixtureRepository();
  const evidence = completeReleaseReadinessEvidence(fixture.head);

  for (const missing of evidence) {
    await t.test(missing.name, () => {
      const gatePath = writeExternalGate(fixture.head, {
        releaseReadinessEvidence: evidence.filter((entry) =>
          entry.name !== missing.name
        )
      });
      const result = runExternalPreflight(fixture, gatePath);

      assert.equal(result.status, 0);
      assert.match(result.stdout, /STATE: READY_LOCAL/);
      assert.doesNotMatch(result.stdout, /STATE: READY_TO_PUSH/);
      assert.match(
        result.stdout,
        new RegExp(
          `\\[EXTERNAL_RELEASE_GATES\\] MISSING_OR_INVALID: ${missing.name}`
        )
      );
    });
  }
});

test('external gate rejects unknown fields, statuses, duplicates, values, and malformed evidence', async (t) => {
  const fixture = createFixtureRepository();
  const concealedValue = 'credential-value-must-never-appear';
  const cases = [
    {
      name: 'unknown top-level key',
      mutate(gate) {
        gate.credentialValue = concealedValue;
      }
    },
    {
      name: 'unknown evidence name',
      mutate(gate) {
        gate.releaseReadinessEvidence[0].name = 'UNAPPROVED_EVIDENCE';
      }
    },
    {
      name: 'unknown evidence status',
      mutate(gate) {
        gate.releaseReadinessEvidence[0].status = 'probably';
      }
    },
    {
      name: 'duplicate evidence entry',
      mutate(gate) {
        gate.releaseReadinessEvidence.push({
          ...gate.releaseReadinessEvidence[0]
        });
      }
    },
    {
      name: 'value-bearing evidence field',
      mutate(gate) {
        gate.releaseReadinessEvidence[0].value = concealedValue;
      }
    },
    {
      name: 'value-bearing evidence detail',
      mutate(gate) {
        gate.releaseReadinessEvidence
          .find((entry) => entry.name === 'VERCEL_PROJECT')
          .details.token = concealedValue;
      }
    },
    {
      name: 'malformed evidence structure',
      mutate(gate) {
        gate.releaseReadinessEvidence = {};
      }
    },
    {
      name: 'evidence bound to another commit',
      mutate(gate) {
        gate.releaseReadinessEvidence[0].head =
          '0000000000000000000000000000000000000000';
      }
    },
    {
      name: 'duplicate configured variable name',
      mutate(gate) {
        gate.configuration.production.push(
          gate.configuration.production[0]
        );
      }
    },
    {
      name: 'unknown configured variable name',
      mutate(gate) {
        gate.configuration.production.push('UNAPPROVED_VARIABLE');
      }
    }
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const gatePath = writeExternalGate(fixture.head);
      const gate = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
      scenario.mutate(gate);
      fs.writeFileSync(gatePath, JSON.stringify(gate));
      const result = runExternalPreflight(fixture, gatePath);

      assert.equal(result.status, 0);
      assert.match(result.stdout, /STATE: READY_LOCAL/);
      assert.doesNotMatch(result.stdout, /STATE: READY_TO_PUSH/);
      assert.match(
        result.stdout,
        /\[EXTERNAL_RELEASE_GATES\] MISSING_OR_INVALID:/
      );
      assert.doesNotMatch(result.stdout, new RegExp(concealedValue));
    });
  }
});

test('external gate validates the facts recorded for each operational assertion', async (t) => {
  const fixture = createFixtureRepository();
  const cases = [
    [
      'COMMITTED_SLICE_SET',
      {
        commits: ['0000000000000000000000000000000000000000'],
        omittedFiles: 'none'
      }
    ],
    ['LOCAL_TEST_SUITE', { command: 'some other test' }],
    ['CATALOG_VALIDATION', { command: 'some other validator' }],
    ['RELEASE_AUDIT', { command: 'some other audit' }],
    ['DEPENDENCY_AUDIT', { command: 'some other dependency audit' }],
    ['VERCEL_PROJECT', { project: 'other-project' }],
    ['RELEASE_BRANCH', { branch: 'feature-branch' }],
    [
      'PRODUCTION_DOMAINS',
      {
        domains: ['other.synthetic.test'],
        source: 'vercel-project-inspection'
      }
    ],
    ['ENVIRONMENT_ASSIGNMENTS', { targets: ['production'] }],
    [
      'AUTOMATIC_PRODUCTION_DEPLOYMENT',
      { trigger: 'manual', manualRedeploy: true }
    ],
    ['C8_A1_CHECKLIST', { location: 'somewhere-else' }],
    ['OBSERVER', { assignment: 'placeholder' }],
    ['ROLLBACK_DECISION', { decision: 'undecided' }]
  ];

  for (const [name, details] of cases) {
    await t.test(name, () => {
      const gatePath = writeExternalGate(fixture.head);
      const gate = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
      gate.releaseReadinessEvidence
        .find((entry) => entry.name === name)
        .details = details;
      fs.writeFileSync(gatePath, JSON.stringify(gate));
      const result = runExternalPreflight(fixture, gatePath);

      assert.equal(result.status, 0);
      assert.match(result.stdout, /STATE: READY_LOCAL/);
      assert.doesNotMatch(result.stdout, /STATE: READY_TO_PUSH/);
      assert.match(
        result.stdout,
        new RegExp(
          `\\[EXTERNAL_RELEASE_GATES\\] MISSING_OR_INVALID: ${name}`
        )
      );
    });
  }
});

test('a release commit diverged from origin/main cannot reach READY_TO_PUSH', () => {
  const fixture = createFixtureRepository();
  git(fixture.root, ['checkout', '-qb', 'divergent', 'origin/main']);
  git(fixture.root, ['commit', '--allow-empty', '-qm', 'divergent']);
  git(fixture.root, [
    'update-ref',
    'refs/remotes/origin/main',
    git(fixture.root, ['rev-parse', 'HEAD'])
  ]);
  git(fixture.root, ['checkout', '-q', 'main']);
  const gatePath = writeExternalGate(fixture.head);
  const result = runExternalPreflight(fixture, gatePath);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /STATE: READY_LOCAL/);
  assert.doesNotMatch(result.stdout, /STATE: READY_TO_PUSH/);
  assert.match(
    result.stdout,
    /\[EXTERNAL_RELEASE_GATES\] MISSING_OR_INVALID: COMMITTED_SLICE_SET/
  );
});

test('Shopify catalog readiness records the exact live Heartlander admission facts', async (t) => {
  const fixture = createFixtureRepository();
  const cases = [
    ['price', { amount: '6.99', currencyCode: 'USD' }],
    ['mediaCount', 4],
    ['optionTuple', [{ name: 'Color', value: 'Heartlander' }]],
    ['productStatus', 'draft'],
    ['headlessPublication', 'unpublished'],
    [
      'dropWindow',
      {
        startsAt: '2026-08-08T12:00:00.000Z',
        endsAt: '2026-08-01T12:00:00.000Z'
      }
    ],
    [
      'dropWindow',
      {
        startsAt: 'August 1, 2026 UTC',
        endsAt: 'August 8, 2026 UTC'
      }
    ],
    [
      'inventoryDecision',
      {
        mode: 'owner-counts-applied',
        counts: [{
          kind: 'peewee-football',
          variantId: 'gid://shopify/ProductVariant/1234567890',
          quantity: 1
        }]
      }
    ]
  ];

  for (const [field, value] of cases) {
    await t.test(field, () => {
      const gatePath = writeExternalGate(fixture.head);
      const gate = JSON.parse(fs.readFileSync(gatePath, 'utf8'));
      gate.shopifyCatalogReadiness.details[field] = value;
      fs.writeFileSync(gatePath, JSON.stringify(gate));
      const result = runExternalPreflight(fixture, gatePath);

      assert.equal(result.status, 0);
      assert.match(result.stdout, /STATE: READY_LOCAL/);
      assert.doesNotMatch(result.stdout, /STATE: READY_TO_PUSH/);
      assert.match(
        result.stdout,
        /\[EXTERNAL_RELEASE_GATES\] MISSING_OR_INVALID: SHOPIFY_CATALOG_READINESS/
      );
    });
  }
});

test('secret-free external evidence bound to the commit can reach READY_TO_PUSH', () => {
  const fixture = createFixtureRepository();
  const gatePath = writeExternalGate(fixture.head);
  const result = runExternalPreflight(fixture, gatePath);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /STATE: READY_TO_PUSH/);
  assert.match(
    result.stdout,
    /\[EXTERNAL_RELEASE_GATES\] PASS: EXTERNAL_GATE/
  );
});
