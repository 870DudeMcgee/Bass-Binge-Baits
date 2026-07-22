#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../assets/js/catalog.js');

const root = path.resolve(__dirname, '..');
const failures = [];
const pages = [
  'index.html',
  'shop.html',
  'about.html',
  'contact.html',
  'privacy.html',
  'products/peewee-football.html',
  'products/peewee-football-hd.html',
  'products/peewee-spider-hd.html',
  'products/heavy-cover-football.html'
];
const productPages = pages.filter((page) => page.startsWith('products/'));
const canonicalUrls = {
  'index.html': 'https://www.bassbingebaits.com/',
  'shop.html': 'https://www.bassbingebaits.com/shop',
  'about.html': 'https://www.bassbingebaits.com/about',
  'contact.html': 'https://www.bassbingebaits.com/contact',
  'privacy.html': 'https://www.bassbingebaits.com/privacy',
  'products/peewee-football.html': 'https://www.bassbingebaits.com/products/peewee-football',
  'products/peewee-football-hd.html': 'https://www.bassbingebaits.com/products/peewee-football-hd',
  'products/peewee-spider-hd.html': 'https://www.bassbingebaits.com/products/peewee-spider-hd',
  'products/heavy-cover-football.html': 'https://www.bassbingebaits.com/products/heavy-cover-football'
};

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

function assertProductZoomAssets() {
  const productScript = read('assets/js/product-page.js');
  const productStyles = read('assets/css/product.css');

  productPages.forEach((page) => {
    const source = read(page);
    if (!/\.\.\/assets\/css\/product\.css\?v=/.test(source)) {
      fail(`${page} does not version product.css`);
    }
    if (!/\.\.\/assets\/js\/product-page\.js\?v=/.test(source)) {
      fail(`${page} does not version product-page.js`);
    }
    if (!/data-gallery/.test(source) || !/product-gallery-track/.test(source)) {
      fail(`${page} is missing the product gallery mount markup`);
    }
  });

  [
    'product-gallery-zoom-toggle',
    'openZoomViewer',
    'product-zoom-modal',
    'product-zoom-stage'
  ].forEach((token) => {
    if (!productScript.includes(token)) {
      fail(`assets/js/product-page.js is missing zoom token: ${token}`);
    }
  });

  [
    '.product-gallery-main.is-zooming',
    '.product-zoom-modal',
    '.product-zoom-stage.is-zooming',
    '.product-zoom-stage.is-zoom-locked'
  ].forEach((token) => {
    if (!productStyles.includes(token)) {
      fail(`assets/css/product.css is missing zoom selector: ${token}`);
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

function matches(source, pattern) {
  return source.match(pattern) || [];
}

function assertCanonicalAndGoogleTags() {
  pages.forEach((page) => {
    const source = read(page);
    const expectedUrl = canonicalUrls[page];

    if (matches(source, /<link rel="canonical"/g).length !== 1 ||
        !source.includes(`<link rel="canonical" href="${expectedUrl}"`)) {
      fail(`${page} must have exactly one canonical URL matching ${expectedUrl}`);
    }
    if (matches(source, /<meta property="og:url"/g).length !== 1 ||
        !source.includes(`<meta property="og:url" content="${expectedUrl}"`)) {
      fail(`${page} must have exactly one matching og:url`);
    }
    if (matches(source, /googletagmanager\.com\/gtag\/js/g).length !== 1 ||
        matches(source, /gtag\('config', 'G-MEK0CBJWR0'\)/g).length !== 1) {
      fail(`${page} must load and configure exactly one Bass Binge Google tag`);
    }
    if (!/assets\/js\/analytics\.js\?v=/.test(source)) {
      fail(`${page} does not load the shared analytics helper`);
    }
    if (/noindex/i.test(source)) {
      fail(`${page} contains noindex`);
    }
    if (/href="[^"]+\.html(?:[?#"])/.test(source)) {
      fail(`${page} contains a legacy .html internal link`);
    }
  });
}

function assertCanonicalSitemap() {
  const sitemap = read('sitemap.xml');
  const locations = Array.from(sitemap.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]);
  const expected = Object.values(canonicalUrls);

  if (/\.html<\/loc>/.test(sitemap)) {
    fail('sitemap.xml contains a redirected .html URL');
  }
  if (locations.length !== new Set(locations).size) {
    fail('sitemap.xml contains duplicate URLs');
  }
  expected.forEach((url) => {
    if (!locations.includes(url)) fail(`sitemap.xml is missing canonical URL ${url}`);
  });
  locations.forEach((url) => {
    if (!expected.includes(url)) fail(`sitemap.xml contains unexpected URL ${url}`);
    if (!url.startsWith('https://www.bassbingebaits.com/')) {
      fail(`sitemap.xml contains domain drift: ${url}`);
    }
  });

  const robots = read('robots.txt');
  if (!robots.includes('Sitemap: https://www.bassbingebaits.com/sitemap.xml')) {
    fail('robots.txt does not advertise the canonical sitemap');
  }
}

function assertCommerceAnalytics() {
  const analytics = read('assets/js/analytics.js');
  const cart = read('assets/js/cart-checkout.js');
  const product = read('assets/js/product-page.js');
  const shop = read('assets/js/shop.js');
  const main = read('assets/js/main.js');
  const combined = [analytics, cart, product, shop, main].join('\n');

  ['view_item_list', 'view_item', 'add_to_cart', 'remove_from_cart', 'view_cart', 'begin_checkout', 'generate_lead']
    .forEach((eventName) => {
      if (!combined.includes(eventName)) fail(`analytics integration is missing ${eventName}`);
    });
  ['item_id', 'item_name', 'item_variant', 'price', 'quantity', "currency: 'USD'"]
    .forEach((field) => {
      if (!analytics.includes(field)) fail(`analytics item payload is missing ${field}`);
    });
  if (/\b(?:email|phone|message|token|first_name|last_name|user_id)\s*:/.test(analytics)) {
    fail('analytics helper contains a prohibited PII field');
  }
  if (!cart.includes("event_callback") && !analytics.includes('event_callback')) {
    fail('begin_checkout does not use a callback-safe redirect');
  }
  if (!main.includes("send('generate_lead'") || !main.includes('if (!response.ok)')) {
    fail('generate_lead is not gated behind a successful contact response');
  }
}

assertNoDemoContactCopy();
assertShopDefaultsCheckoutable();
assertFaviconLinks();
assertSitemapProducts();
assertSharedAssetCacheBust();
assertProductZoomAssets();
assertScriptsAreNotImmutableCached();
assertCanonicalAndGoogleTags();
assertCanonicalSitemap();
assertCommerceAnalytics();

if (failures.length) {
  console.error('Release audit failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Release audit passed.');
