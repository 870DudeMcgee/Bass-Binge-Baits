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
  'products/heavy-cover-football.html',
  'products/finesse-jig.html',
  'products/pee-wee-football.html',
  'products/limited-drop.html'
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
  'products/heavy-cover-football.html': 'https://www.bassbingebaits.com/products/heavy-cover-football',
  'products/finesse-jig.html': 'https://www.bassbingebaits.com/products/finesse-jig',
  'products/pee-wee-football.html': 'https://www.bassbingebaits.com/products/pee-wee-football',
  'products/limited-drop.html': 'https://www.bassbingebaits.com/products/limited-drop'
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

function assertCanonicalIndexing() {
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
    if (/googletagmanager\.com|G-MEK0CBJWR0|assets\/js\/analytics\.js/.test(source)) {
      fail(`${page} contains unapproved Google Analytics tracking`);
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

assertNoDemoContactCopy();
assertShopDefaultsCheckoutable();
assertFaviconLinks();
assertSitemapProducts();
assertSharedAssetCacheBust();
assertProductZoomAssets();
assertScriptsAreNotImmutableCached();
assertCanonicalIndexing();
assertCanonicalSitemap();

if (failures.length) {
  console.error('Release audit failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Release audit passed.');
