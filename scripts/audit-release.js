#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { renderGenericProductPage } = require('../lib/generic-product-route.js');

const root = path.resolve(__dirname, '..');
const failures = [];
const staticPages = [
  'index.html',
  'shop.html',
  'about.html',
  'contact.html',
  'privacy.html'
];
const canonicalUrls = {
  'index.html': 'https://www.bassbingebaits.com/',
  'shop.html': 'https://www.bassbingebaits.com/shop',
  'about.html': 'https://www.bassbingebaits.com/about',
  'contact.html': 'https://www.bassbingebaits.com/contact',
  'privacy.html': 'https://www.bassbingebaits.com/privacy'
};
const establishedProductPages = [
  'finesse-jig.html',
  'heavy-cover-football.html',
  'limited-drop.html',
  'pee-wee-football.html',
  'peewee-football-hd.html',
  'peewee-football.html',
  'peewee-spider-hd.html'
];

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

function assertFaviconLinks() {
  staticPages.forEach((page) => {
    const source = read(page);
    if (!/rel="icon"/.test(source)) {
      fail(`${page} is missing a favicon link`);
    }
    if (!/property="og:image"/.test(source)) {
      fail(`${page} is missing og:image`);
    }
  });
}

function assertSharedAssetCacheBust() {
  staticPages.forEach((page) => {
    const source = read(page);
    if (!/assets\/css\/styles\.css\?v=/.test(source)) {
      fail(`${page} does not version styles.css`);
    }
    if (!/assets\/js\/main\.js\?v=/.test(source)) {
      fail(`${page} does not version main.js`);
    }
  });
}

function assertEstablishedProductRoutes() {
  const productDirectory = path.join(root, 'products');
  const staticProductFiles = fs.existsSync(productDirectory)
    ? fs.readdirSync(productDirectory).filter((filename) => filename.endsWith('.html'))
    : [];
  establishedProductPages.forEach((filename) => {
    if (!staticProductFiles.includes(filename)) {
      fail(`products/ is missing the established storefront page ${filename}`);
    }
  });
}

function assertGenericProductRewrite() {
  const vercelConfig = JSON.parse(read('vercel.json'));
  const genericRewrite = (vercelConfig.rewrites || []).find((rewrite) =>
    rewrite.source === '/products/:handle'
  );
  if (!genericRewrite || genericRewrite.destination !== '/api/product?handle=:handle') {
    fail('vercel.json does not route every product handle through /api/product');
  }
}

function releaseAuditProduct() {
  return {
    id: 'gid://shopify/Product/release-audit',
    handle: 'release-audit-jig',
    title: 'Release Audit Jig',
    descriptionHtml: '<p>Current admitted Shopify description.</p>',
    vendor: 'Bass Binge Baits',
    productType: 'Jig',
    availableForSale: true,
    media: [{
      id: 'gid://shopify/MediaImage/release-audit',
      type: 'image',
      alt: 'Release audit jig',
      image: {
        url: 'https://cdn.shopify.com/release-audit.jpg',
        width: 1200,
        height: 1200
      }
    }],
    options: [],
    variants: [{
      id: 'gid://shopify/ProductVariant/release-audit',
      title: 'Default Title',
      selectedOptions: [],
      price: { amount: '5.00', currencyCode: 'USD' },
      compareAtPrice: null,
      availableForSale: true,
      quantityAvailable: 1,
      imageId: 'gid://shopify/MediaImage/release-audit'
    }],
    presentation: { kind: 'ordinary' }
  };
}

function assertGenericProductRendering() {
  const rendered = renderGenericProductPage(releaseAuditProduct());
  const canonical = 'https://www.bassbingebaits.com/products/release-audit-jig';
  [
    '<body data-generic-product>',
    'class="product-gallery"',
    'class="product-hero"',
    '<link rel="icon"',
    `<link rel="canonical" href="${canonical}"`,
    `<meta property="og:url" content="${canonical}"`,
    'Current admitted Shopify description.',
    '/assets/css/product.css?v=',
    '/assets/js/generic-product-page.js?v='
  ].forEach((token) => {
    if (!rendered.includes(token)) {
      fail(`generic product rendering is missing ${token}`);
    }
  });
  if (/googletagmanager\.com|G-MEK0CBJWR0|noindex/i.test(rendered)) {
    fail('generic admitted product rendering contains blocked indexing or analytics markup');
  }
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
  staticPages.forEach((page) => {
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
    if (!url.startsWith('https://www.bassbingebaits.com/')) {
      fail(`sitemap.xml contains domain drift: ${url}`);
    }
    if (!expected.includes(url) && !/^https:\/\/www\.bassbingebaits\.com\/products\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url)) {
      fail(`sitemap.xml contains unexpected URL ${url}`);
    }
  });

  const robots = read('robots.txt');
  if (!robots.includes('Sitemap: https://www.bassbingebaits.com/sitemap.xml')) {
    fail('robots.txt does not advertise the canonical sitemap');
  }
}

assertNoDemoContactCopy();
assertFaviconLinks();
assertSharedAssetCacheBust();
assertEstablishedProductRoutes();
assertGenericProductRewrite();
assertGenericProductRendering();
assertScriptsAreNotImmutableCached();
assertCanonicalIndexing();
assertCanonicalSitemap();

if (failures.length) {
  console.error('Release audit failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Release audit passed.');
