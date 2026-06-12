#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../assets/js/catalog.js');

const root = path.resolve(__dirname, '..');
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function assertNoDemoContactCopy() {
  const files = ['assets/js/main.js', 'contact.html'];
  const banned = /\b(demo|placeholder|hook it)\b/i;

  files.forEach((file) => {
    const source = read(file);
    if (banned.test(source)) {
      fail(`${file} still contains demo/placeholder contact copy`);
    }
  });
}

function assertShopDefaultsCheckoutable() {
  catalog.listProducts().forEach((product) => {
    const build = catalog.getJigBuild({
      productKey: product.key,
      colorKey: product.defaultColorKey,
      weightKey: product.defaultWeightKey,
      rattleKey: product.rattle && product.rattle.defaultKey ? product.rattle.defaultKey : 'no'
    });

    if (!build || !build.isCheckoutable) {
      fail(`${product.title} default build is not checkoutable`);
    }
  });
}

function assertFaviconLinks() {
  const pages = [
    'index.html',
    'shop.html',
    'about.html',
    'contact.html',
    'products/peewee-football.html',
    'products/peewee-football-hd.html',
    'products/peewee-spider-hd.html',
    'products/heavy-cover-football.html'
  ];

  pages.forEach((page) => {
    const source = read(page);
    if (!/rel="icon"/.test(source)) {
      fail(`${page} is missing a favicon link`);
    }
    if (!/property="og:image"/.test(source)) {
      fail(`${page} is missing og:image`);
    }
  });
}

function assertSitemapProducts() {
  const sitemap = read('sitemap.xml');
  catalog.listProducts().forEach((product) => {
    if (!sitemap.includes(product.pagePath)) {
      fail(`sitemap.xml is missing ${product.pagePath}`);
    }
  });
}

function assertSharedAssetCacheBust() {
  const pages = [
    'index.html',
    'shop.html',
    'about.html',
    'contact.html',
    'products/peewee-football.html',
    'products/peewee-football-hd.html',
    'products/peewee-spider-hd.html',
    'products/heavy-cover-football.html'
  ];

  pages.forEach((page) => {
    const source = read(page);
    if (!/assets\/css\/styles\.css\?v=/.test(source)) {
      fail(`${page} does not version styles.css`);
    }
    if (!/assets\/js\/main\.js\?v=/.test(source)) {
      fail(`${page} does not version main.js`);
    }
  });
}

function assertScriptsAreNotImmutableCached() {
  const vercelConfig = JSON.parse(read('vercel.json'));
  const frozenScriptRule = (vercelConfig.headers || []).find((rule) => {
    const source = String(rule.source || '');
    const cacheHeader = (rule.headers || []).find((header) => header.key.toLowerCase() === 'cache-control');
    const value = cacheHeader ? String(cacheHeader.value || '') : '';

    return /assets\/(?:\(\.\*\)|js|css)/.test(source) && /immutable/i.test(value);
  });

  if (frozenScriptRule) {
    fail('vercel.json must not immutable-cache CSS or JS without hashed filenames');
  }
}

assertNoDemoContactCopy();
assertShopDefaultsCheckoutable();
assertFaviconLinks();
assertSitemapProducts();
assertSharedAssetCacheBust();
assertScriptsAreNotImmutableCached();

if (failures.length) {
  console.error('Release audit failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Release audit passed.');
