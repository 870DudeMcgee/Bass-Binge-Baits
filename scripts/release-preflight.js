#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { deriveCatalogNamespace } = require('../lib/catalog-namespace.js');

const CORE_VARIABLES = [
  'SHOPIFY_STORE_DOMAIN',
  'SHOPIFY_WEBHOOK_SECRET',
  'CATALOG_HEALTH_TOKEN',
  'CRON_SECRET'
];
const STOREFRONT_CREDENTIALS = [
  'SHOPIFY_STOREFRONT_ACCESS_TOKEN',
  'SHOPIFY_STOREFRONT_PRIVATE_TOKEN'
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
const EXPECTED_HEARTLANDER_TITLE =
  '5/8 oz PeeWee Football HD — Heartlander';
const RELEASE_READINESS_EVIDENCE = [
  {
    name: 'COMMITTED_SLICE_SET',
    status: 'accepted',
    validateDetails: (details, expectedHead) =>
      hasExactKeys(details, ['commits', 'omittedFiles']) &&
      Array.isArray(details.commits) &&
      details.commits.length > 0 &&
      new Set(details.commits).size === details.commits.length &&
      details.commits.every((commit) => /^[0-9a-f]{40}$/.test(commit)) &&
      details.commits.includes(expectedHead) &&
      details.omittedFiles === 'none'
  },
  {
    name: 'LOCAL_TEST_SUITE',
    status: 'passed',
    details: { command: 'node --test test/*.test.js' }
  },
  {
    name: 'CATALOG_VALIDATION',
    status: 'passed',
    details: { command: 'node scripts/validate-catalog.js' }
  },
  {
    name: 'RELEASE_AUDIT',
    status: 'passed',
    details: { command: 'node scripts/audit-release.js' }
  },
  {
    name: 'DEPENDENCY_AUDIT',
    status: 'passed',
    details: { command: 'npm audit --omit=dev' }
  },
  {
    name: 'VERCEL_PROJECT',
    status: 'confirmed',
    validateDetails: (details) =>
      hasExactKeys(details, ['project']) &&
      isApprovedIdentifier(details.project)
  },
  {
    name: 'RELEASE_BRANCH',
    status: 'confirmed',
    details: { branch: 'main' }
  },
  {
    name: 'PRODUCTION_DOMAINS',
    status: 'confirmed',
    validateDetails: (details) =>
      hasExactKeys(details, ['domains', 'source']) &&
      details.source === 'vercel-project-inspection' &&
      Array.isArray(details.domains) &&
      details.domains.length > 0 &&
      new Set(details.domains).size === details.domains.length &&
      details.domains.every(isDomainName)
  },
  {
    name: 'ENVIRONMENT_ASSIGNMENTS',
    status: 'confirmed',
    details: { targets: ['production', 'preview'] }
  },
  {
    name: 'AUTOMATIC_PRODUCTION_DEPLOYMENT',
    status: 'confirmed',
    details: {
      trigger: 'push-to-main',
      manualRedeploy: false
    }
  },
  {
    name: 'C8_A1_CHECKLIST',
    status: 'written',
    details: {
      location: 'docs/shopify-universal-ingestion-remediation-plan.md#c8-a1'
    }
  },
  {
    name: 'OBSERVER',
    status: 'assigned',
    validateDetails: (details) =>
      hasExactKeys(details, ['assignment']) &&
      isApprovedIdentifier(details.assignment)
  },
  {
    name: 'ROLLBACK_DECISION',
    status: 'recorded',
    validateDetails: (details) =>
      hasExactKeys(details, ['decision']) &&
      [
        'rollback-on-acceptance-failure',
        'hold-on-acceptance-failure'
      ].includes(details.decision)
  }
];

function hasExactKeys(value, expected) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
}

function hasExactDetails(actual, expected) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) &&
      actual.length === expected.length &&
      actual.every((value, index) => hasExactDetails(value, expected[index]));
  }
  if (expected && typeof expected === 'object') {
    return hasExactKeys(actual, Object.keys(expected)) &&
      Object.keys(expected).every((key) =>
        hasExactDetails(actual[key], expected[key])
      );
  }
  return actual === expected;
}

function isApprovedIdentifier(value) {
  return typeof value === 'string' &&
    /^[a-z0-9][a-z0-9._-]{1,99}$/i.test(value) &&
    !isPlaceholder(value);
}

function isDomainName(value) {
  return typeof value === 'string' &&
    value.length <= 253 &&
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i
      .test(value);
}

function inspectLinkedProject(root) {
  try {
    const project = JSON.parse(
      fs.readFileSync(path.join(root, '.vercel', 'project.json'), 'utf8')
    );
    return isApprovedIdentifier(project.projectName)
      ? project.projectName
      : '';
  } catch (error) {
    return '';
  }
}

function inspectCanonicalDomains(root) {
  try {
    const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
    return [...new Set(
      [...sitemap.matchAll(/<loc>(https:\/\/[^<]+)<\/loc>/g)]
        .map((match) => new URL(match[1]).hostname)
    )].sort();
  } catch (error) {
    return [];
  }
}

function inventoryDecisionIsValid(decision) {
  if (hasExactDetails(decision, { mode: 'leave-zero' })) return true;
  return hasExactKeys(decision, ['mode', 'counts']) &&
    decision.mode === 'owner-counts-applied' &&
    Array.isArray(decision.counts) &&
    decision.counts.length === 13 &&
    new Set(decision.counts.map((entry) => entry.variantId)).size ===
      decision.counts.length &&
    decision.counts.every((entry) =>
      hasExactKeys(entry, ['kind', 'variantId', 'quantity']) &&
      ['peewee-football', 'rattle-add-on'].includes(entry.kind) &&
      /^gid:\/\/shopify\/ProductVariant\/\d+$/.test(entry.variantId) &&
      Number.isInteger(entry.quantity) &&
      entry.quantity >= 0
    ) &&
    decision.counts.filter((entry) => entry.kind === 'peewee-football')
      .length === 12 &&
    decision.counts.filter((entry) => entry.kind === 'rattle-add-on')
      .length === 1;
}

function parseIsoTimestamp(value) {
  if (typeof value !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return Number.NaN;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return Number.NaN;
  const normalized = value.endsWith('.000Z') || !value.includes('.')
    ? value.replace(/(?:\.000)?Z$/, '.000Z')
    : value;
  return new Date(timestamp).toISOString() === normalized
    ? timestamp
    : Number.NaN;
}

function shopifyReadinessIsValid(readiness, expectedHead) {
  if (!hasExactKeys(readiness, ['status', 'head', 'details']) ||
      readiness.status !== 'accepted' ||
      readiness.head !== expectedHead) {
    return false;
  }
  const details = readiness.details;
  return hasExactKeys(details, [
    'handle',
    'title',
    'price',
    'variantId',
    'mediaCount',
    'optionTuple',
    'productStatus',
    'headlessPublication',
    'dropWindow',
    'inventoryDecision'
  ]) &&
    details.handle === 'limited-drop' &&
    details.title === EXPECTED_HEARTLANDER_TITLE &&
    hasExactDetails(details.price, { amount: '5.99', currencyCode: 'USD' }) &&
    /^gid:\/\/shopify\/ProductVariant\/\d+$/.test(details.variantId) &&
    details.mediaCount === 5 &&
    hasExactDetails(details.optionTuple, [
      { name: 'Color', value: 'Heartlander' },
      { name: 'Weight', value: '5/8 oz' }
    ]) &&
    details.productStatus === 'active' &&
    details.headlessPublication === 'published' &&
    hasExactKeys(details.dropWindow, ['startsAt', 'endsAt']) &&
    Number.isFinite(parseIsoTimestamp(details.dropWindow.startsAt)) &&
    Number.isFinite(parseIsoTimestamp(details.dropWindow.endsAt)) &&
    parseIsoTimestamp(details.dropWindow.endsAt) >
      parseIsoTimestamp(details.dropWindow.startsAt) &&
    inventoryDecisionIsValid(details.inventoryDecision);
}

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

function repositoryEvidenceMatches(root, requirement, details, expectedHead) {
  if (requirement.name === 'COMMITTED_SLICE_SET') {
    const ancestor = runGit(
      root,
      ['merge-base', '--is-ancestor', 'origin/main', expectedHead]
    );
    const releaseRange = runGit(
      root,
      ['rev-list', '--reverse', `origin/main..${expectedHead}`]
    );
    return ancestor.status === 0 &&
      releaseRange.status === 0 &&
      hasExactDetails(
        details.commits,
        releaseRange.stdout.trim().split('\n').filter(Boolean)
      );
  }
  if (requirement.name === 'RELEASE_BRANCH') {
    const branch = runGit(root, ['branch', '--show-current']);
    return branch.status === 0 && branch.stdout.trim() === details.branch;
  }
  if (requirement.name === 'VERCEL_PROJECT') {
    return inspectLinkedProject(root) === details.project;
  }
  if (requirement.name === 'PRODUCTION_DOMAINS') {
    const canonicalDomains = inspectCanonicalDomains(root);
    return canonicalDomains.length > 0 &&
      canonicalDomains.every((domain) =>
        details.domains.includes(domain)
      );
  }
  return true;
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
  const storefrontCredential = STOREFRONT_CREDENTIALS.find((name) =>
    isUsable(environment, name)
  );
  addResult(
    results,
    'CORE_CONFIGURATION',
    Boolean(storefrontCredential),
    storefrontCredential || STOREFRONT_CREDENTIALS
  );

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

function inspectExternalGate(externalGate, expectedHead, root, results) {
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
    const allowedNames = [
      ...CORE_VARIABLES,
      ...STOREFRONT_CREDENTIALS,
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
      const corePresent = CORE_VARIABLES.every((name) => uniqueNames.has(name)) &&
        STOREFRONT_CREDENTIALS.some((name) => uniqueNames.has(name));
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
    const shopifyReadinessValid = shopifyReadinessIsValid(
      gate.shopifyCatalogReadiness,
      expectedHead
    );
    const gateShapeIsValid = hasExactKeys(gate, [
      'schemaVersion',
      'head',
      'shopifyCatalogReadiness',
      'contactDelivery',
      'configuration',
      'releaseReadinessEvidence'
    ]) &&
      hasExactKeys(gate.configuration, ['production', 'preview']) &&
      gate.schemaVersion === 2 &&
      gate.head === expectedHead &&
      ['configured', 'not-in-release'].includes(gate.contactDelivery) &&
      environmentNamesAreValid('production', gate.configuration.production) &&
      environmentNamesAreValid('preview', gate.configuration.preview);
    const evidence = Array.isArray(gate.releaseReadinessEvidence)
      ? gate.releaseReadinessEvidence
      : [];
    const expectedEvidenceNames = RELEASE_READINESS_EVIDENCE.map(({ name }) => name);
    const evidenceNames = evidence.map((entry) =>
      entry && typeof entry === 'object' && !Array.isArray(entry)
        ? entry.name
        : undefined
    );
    const evidenceSetIsValid = evidence.length === RELEASE_READINESS_EVIDENCE.length &&
      new Set(evidenceNames).size === evidenceNames.length &&
      evidence.every((entry) =>
        hasExactKeys(entry, ['name', 'status', 'head', 'details']) &&
        expectedEvidenceNames.includes(entry.name)
      );

    addResult(
      results,
      'EXTERNAL_RELEASE_GATES',
      gateShapeIsValid && evidenceSetIsValid,
      'EXTERNAL_GATE_SCHEMA'
    );
    addResult(
      results,
      'EXTERNAL_RELEASE_GATES',
      shopifyReadinessValid,
      'SHOPIFY_CATALOG_READINESS'
    );
    RELEASE_READINESS_EVIDENCE.forEach((requirement) => {
      const { name, status } = requirement;
      const matches = evidence.filter((entry) =>
        entry && typeof entry === 'object' && !Array.isArray(entry) &&
        entry.name === name
      );
      addResult(
        results,
        'EXTERNAL_RELEASE_GATES',
        matches.length === 1 &&
          hasExactKeys(matches[0], ['name', 'status', 'head', 'details']) &&
          matches[0].status === status &&
          matches[0].head === expectedHead &&
          (
            requirement.validateDetails
              ? requirement.validateDetails(matches[0].details, expectedHead)
              : hasExactDetails(matches[0].details, requirement.details)
          ) &&
          repositoryEvidenceMatches(
            root,
            requirement,
            matches[0].details,
            expectedHead
          ),
        name
      );
    });
  } catch (error) {
    addResult(results, 'EXTERNAL_RELEASE_GATES', false, 'EXTERNAL_GATE');
  }
}

function render(results) {
  const externalResults = results.filter((result) =>
    result.evidenceClass === 'EXTERNAL_RELEASE_GATES'
  );
  const externalReady = externalResults.length > 0 &&
    externalResults.every((result) => result.ok);
  const externallySatisfiedClasses = externalReady
    ? new Set(['CORE_CONFIGURATION'])
    : new Set();
  const coreFailures = results.filter((result) =>
    result.evidenceClass !== 'CONTACT_DELIVERY' &&
    result.evidenceClass !== 'EXTERNAL_RELEASE_GATES' &&
    !externallySatisfiedClasses.has(result.evidenceClass) &&
    !result.ok
  );
  const state = coreFailures.length
    ? 'BLOCKED'
    : externalReady
      ? 'READY_TO_PUSH'
      : 'READY_LOCAL';

  console.log(`STATE: ${state}`);
  for (const result of results) {
    const status = result.ok
      ? 'PASS'
      : externallySatisfiedClasses.has(result.evidenceClass) && externalReady
        ? 'PASS_EXTERNAL'
        : 'MISSING_OR_INVALID';
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
  inspectExternalGate(
    options.externalGate,
    options.expectedHead,
    options.root,
    results
  );
  const state = render(results);
  process.exitCode = state === 'BLOCKED' ? 1 : 0;
}

if (require.main === module) main();

module.exports = {
  main
};
