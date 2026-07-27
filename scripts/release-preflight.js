#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { deriveCatalogNamespace } = require('../lib/catalog-namespace.js');

const CORE_VARIABLES = [
  'SHOPIFY_STORE_DOMAIN',
  'SHOPIFY_STOREFRONT_PRIVATE_TOKEN',
  'SHOPIFY_WEBHOOK_SECRET',
  'CATALOG_HEALTH_TOKEN',
  'CRON_SECRET'
];
const CONTACT_VARIABLES = [
  'RESEND_API_KEY',
  'CONTACT_FROM_EMAIL',
  'CONTACT_TO_EMAIL'
];
const DURABLE_PAIRS = [
  ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
  ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']
];
const EXPECTED_CRON = {
  path: '/api/catalog-reconcile',
  schedule: '0 0 * * *'
};

function parseArguments(argv) {
  const options = {
    root: path.resolve(__dirname, '..'),
    expectedHead: '',
    externalGate: ''
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--root') options.root = path.resolve(argv[++index] || '');
    else if (argument === '--expected-head') options.expectedHead = argv[++index] || '';
    else if (argument === '--external-gate') options.externalGate = path.resolve(argv[++index] || '');
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function isPresent(environment, name) {
  return typeof environment[name] === 'string' && environment[name].trim() !== '';
}

function isPlaceholder(value) {
  const normalized = String(value || '').trim();
  return /^(?:x+|placeholder|change[-_ ]?me|replace[-_ ]?me|dummy|example|todo|unset|null|undefined)$/i
    .test(normalized) ||
    /^<[^>]+>$/.test(normalized) ||
    /x{6,}$/i.test(normalized);
}

function isUsable(environment, name) {
  return isPresent(environment, name) && !isPlaceholder(environment[name]);
}

function isHttpsUrl(value) {
  try {
    const parsed = new URL(String(value));
    return parsed.protocol === 'https:' &&
      !/^example(?:\.|$)/i.test(parsed.hostname);
  } catch (error) {
    return false;
  }
}

function runGit(root, arguments_) {
  return spawnSync('git', arguments_, {
    cwd: root,
    encoding: 'utf8'
  });
}

function addResult(results, evidenceClass, ok, names, detail) {
  results.push({
    evidenceClass,
    ok,
    names: Array.isArray(names) ? names : [names],
    detail
  });
}

function inspectConfiguration(environment, results) {
  CORE_VARIABLES.forEach((name) => {
    addResult(results, 'CORE_CONFIGURATION', isUsable(environment, name), name);
  });

  const configuredPairs = DURABLE_PAIRS.filter((pair) =>
    pair.some((name) => isPresent(environment, name))
  );
  if (configuredPairs.length !== 1) {
    addResult(
      results,
      'CORE_CONFIGURATION',
      false,
      DURABLE_PAIRS.flat(),
      'configure exactly one complete durable-store pair'
    );
  } else {
    configuredPairs[0].forEach((name, index) => {
      const usable = isUsable(environment, name) &&
        (index !== 0 || isHttpsUrl(environment[name]));
      addResult(results, 'CORE_CONFIGURATION', usable, name);
    });
  }

  CONTACT_VARIABLES.forEach((name) => {
    addResult(results, 'CONTACT_DELIVERY', isUsable(environment, name), name);
  });

  const vercelEnvironment = String(environment.VERCEL_ENV || '').trim().toLowerCase();
  addResult(
    results,
    'OPERATIONAL_CONFIGURATION',
    ['production', 'preview'].includes(vercelEnvironment),
    'VERCEL_ENV'
  );
  if (vercelEnvironment === 'production') {
    addResult(
      results,
      'OPERATIONAL_CONFIGURATION',
      isUsable(environment, 'VERCEL_PROJECT_PRODUCTION_URL'),
      'VERCEL_PROJECT_PRODUCTION_URL'
    );
  } else if (vercelEnvironment === 'preview') {
    addResult(
      results,
      'OPERATIONAL_CONFIGURATION',
      isUsable(environment, 'VERCEL_DEPLOYMENT_ID') ||
        isUsable(environment, 'VERCEL_URL'),
      ['VERCEL_DEPLOYMENT_ID', 'VERCEL_URL'],
      'one unique Preview identity is required'
    );
  }
}

function inspectRepository(root, expectedHead, results) {
  const head = runGit(root, ['rev-parse', 'HEAD']);
  const status = runGit(root, ['status', '--porcelain']);
  const expectedHeadValid = /^[0-9a-f]{40}$/.test(expectedHead);
  addResult(
    results,
    'GIT_RELEASE_STATE',
    head.status === 0 && expectedHeadValid && head.stdout.trim() === expectedHead,
    'EXPECTED_HEAD',
    'must match the exact current commit'
  );
  addResult(
    results,
    'GIT_RELEASE_STATE',
    status.status === 0 && status.stdout === '',
    'CLEAN_WORKTREE',
    'tracked, staged, and untracked changes must be absent'
  );
}

function inspectCron(root, results) {
  try {
    const configuration = JSON.parse(
      fs.readFileSync(path.join(root, 'vercel.json'), 'utf8')
    );
    const crons = Array.isArray(configuration.crons) ? configuration.crons : [];
    const valid = crons.length === 1 &&
      crons[0].path === EXPECTED_CRON.path &&
      crons[0].schedule === EXPECTED_CRON.schedule;
    addResult(results, 'RELEASE_CONFIGURATION', valid, 'VERCEL_HOBBY_CRON');
  } catch (error) {
    addResult(results, 'RELEASE_CONFIGURATION', false, 'VERCEL_HOBBY_CRON');
  }
}

function inspectNamespace(environment, results) {
  try {
    deriveCatalogNamespace(environment);
    addResult(results, 'RELEASE_CONFIGURATION', true, 'CATALOG_CACHE_NAMESPACE');
  } catch (error) {
    addResult(results, 'RELEASE_CONFIGURATION', false, 'CATALOG_CACHE_NAMESPACE');
  }
}

function inspectStrictShopify(root, environment, results) {
  const validator = spawnSync(
    process.execPath,
    [path.join(root, 'scripts', 'validate-shopify-integration.js'), '--strict'],
    {
      cwd: root,
      env: environment,
      encoding: 'utf8'
    }
  );
  addResult(
    results,
    'STRICT_SHOPIFY_VALIDATION',
    validator.status === 0,
    'STRICT_SHOPIFY_VALIDATION'
  );
}

function inspectExternalGate(externalGate, expectedHead, results) {
  if (!externalGate) {
    addResult(
      results,
      'EXTERNAL_RELEASE_GATES',
      false,
      'EXTERNAL_GATE',
      'not supplied; local evidence cannot authorize push'
    );
    return;
  }
  try {
    const gate = JSON.parse(fs.readFileSync(externalGate, 'utf8'));
    const exactKeys = (value, expected) =>
      value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
    const allowedNames = [
      ...CORE_VARIABLES,
      ...CONTACT_VARIABLES,
      ...DURABLE_PAIRS.flat(),
      'VERCEL_ENV',
      'VERCEL_PROJECT_PRODUCTION_URL',
      'VERCEL_DEPLOYMENT_ID',
      'VERCEL_URL'
    ];
    const environmentNamesAreValid = (target, names) => {
      if (!Array.isArray(names)) return false;
      const uniqueNames = new Set(names);
      const corePresent = CORE_VARIABLES.every((name) => uniqueNames.has(name));
      const durablePairCount = DURABLE_PAIRS.filter((pair) =>
        pair.every((name) => uniqueNames.has(name))
      ).length;
      const contactPresent = gate.contactDelivery === 'not-in-release' ||
        CONTACT_VARIABLES.every((name) => uniqueNames.has(name));
      const trustPresent = uniqueNames.has('VERCEL_ENV') && (
        target === 'production'
          ? uniqueNames.has('VERCEL_PROJECT_PRODUCTION_URL')
          : uniqueNames.has('VERCEL_DEPLOYMENT_ID') || uniqueNames.has('VERCEL_URL')
      );
      return uniqueNames.size === names.length &&
        corePresent &&
        durablePairCount === 1 &&
        contactPresent &&
        trustPresent &&
        names.every((name) => allowedNames.includes(name));
    };
    const valid = exactKeys(gate, [
      'schemaVersion',
      'head',
      'shopifyCatalogReadiness',
      'contactDelivery',
      'configuration'
    ]) &&
      exactKeys(gate.configuration, ['production', 'preview']) &&
      gate.schemaVersion === 1 &&
      gate.head === expectedHead &&
      gate.shopifyCatalogReadiness === 'accepted' &&
      ['configured', 'not-in-release'].includes(gate.contactDelivery) &&
      environmentNamesAreValid('production', gate.configuration.production) &&
      environmentNamesAreValid('preview', gate.configuration.preview);
    addResult(results, 'EXTERNAL_RELEASE_GATES', valid, 'EXTERNAL_GATE');
  } catch (error) {
    addResult(results, 'EXTERNAL_RELEASE_GATES', false, 'EXTERNAL_GATE');
  }
}

function render(results) {
  const coreFailures = results.filter((result) =>
    result.evidenceClass !== 'CONTACT_DELIVERY' &&
    result.evidenceClass !== 'EXTERNAL_RELEASE_GATES' &&
    !result.ok
  );
  const externalReady = results.some((result) =>
    result.evidenceClass === 'EXTERNAL_RELEASE_GATES' && result.ok
  );
  const state = coreFailures.length
    ? 'BLOCKED'
    : externalReady
      ? 'READY_TO_PUSH'
      : 'READY_LOCAL';

  console.log(`STATE: ${state}`);
  for (const result of results) {
    const status = result.ok ? 'PASS' : 'MISSING_OR_INVALID';
    console.log(`[${result.evidenceClass}] ${status}: ${result.names.join(', ')}`);
  }
  return state;
}

function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    console.error('STATE: BLOCKED');
    console.error('[COMMAND] MISSING_OR_INVALID: ARGUMENTS');
    process.exit(1);
  }

  const results = [];
  inspectConfiguration(process.env, results);
  inspectCron(options.root, results);
  inspectNamespace(process.env, results);
  inspectRepository(options.root, options.expectedHead, results);
  inspectStrictShopify(options.root, process.env, results);
  inspectExternalGate(options.externalGate, options.expectedHead, results);
  const state = render(results);
  process.exitCode = state === 'BLOCKED' ? 1 : 0;
}

if (require.main === module) main();

module.exports = {
  main
};
