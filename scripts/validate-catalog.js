#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const catalog = require('../assets/js/catalog.js');

const root = path.resolve(__dirname, '..');
const failures = [];
const seenProducts = new Set();
const seenVariants = new Set();

function fail(message) {
  failures.push(message);
}

function assertUnique(set, key, label) {
  if (set.has(key)) {
    fail(`Duplicate ${label}: ${key}`);
  }
  set.add(key);
}

catalog.listProducts().forEach((product) => {
  assertUnique(seenProducts, product.key, 'product key');

  if (!product.title) fail(`${product.key} is missing a title`);
  if (!product.pagePath) fail(`${product.key} is missing pagePath`);
  if (product.pagePath && !fs.existsSync(path.join(root, `${product.pagePath}.html`))) {
    fail(`${product.key} page does not exist: ${product.pagePath}`);
  }
  if (product.featuredImage && !fs.existsSync(path.join(root, product.featuredImage))) {
    fail(`${product.key} featured image does not exist: ${product.featuredImage}`);
  }

  const defaultColor = catalog.getColor(product, product.defaultColorKey);
  const defaultWeight = catalog.getWeight(product, product.defaultWeightKey);
  if (!defaultColor) fail(`${product.key} default color is invalid: ${product.defaultColorKey}`);
  if (!defaultWeight) fail(`${product.key} default weight is invalid: ${product.defaultWeightKey}`);

  const seenColors = new Set();
  product.colors.forEach((color) => {
    assertUnique(seenColors, color.key, `${product.key} color key`);
    if (!color.name) fail(`${product.key}/${color.key} is missing a name`);
    if (!color.swatch) fail(`${product.key}/${color.key} is missing a swatch`);
    if (!color.image) fail(`${product.key}/${color.key} is missing an image`);
    if (color.image && !/^https?:\/\//.test(color.image)) {
      const imagePath = path.join(root, color.image);
      if (!fs.existsSync(imagePath)) {
        fail(`${product.key}/${color.key} image does not exist: ${color.image}`);
      }
    }

    if (color.checkout && color.checkout.variantId) {
      assertUnique(seenVariants, String(color.checkout.variantId), 'Shopify variant ID');
    }
  });

  const seenWeights = new Set();
  product.weights.forEach((weight) => {
    assertUnique(seenWeights, weight.key, `${product.key} weight key`);
    if (!weight.label) fail(`${product.key}/${weight.key} is missing a weight label`);
  });

  const defaultBuild = catalog.getJigBuild({
    productKey: product.key,
    colorKey: product.defaultColorKey,
    weightKey: product.defaultWeightKey,
    rattleKey: product.rattle.defaultKey
  });

  if (!defaultBuild) {
    fail(`${product.key} does not produce a default Jig Build`);
  }
});

const productPages = fs.readdirSync(path.join(root, 'products'))
  .filter((file) => file.endsWith('.html'))
  .map((file) => path.join(root, 'products', file));

productPages.forEach((filePath) => {
  const html = fs.readFileSync(filePath, 'utf8');
  const relative = path.relative(root, filePath);

  if (!/data-product-key=/.test(html)) {
    fail(`${relative} is missing data-product-key`);
  }

  ['data-colors', 'data-color-images', 'data-weights', 'data-rattle'].forEach((attribute) => {
    const oldAttributePattern = new RegExp(`${attribute}\\s*=`);
    if (oldAttributePattern.test(html)) {
      fail(`${relative} still contains ${attribute}`);
    }
  });

  if (!html.includes('../assets/js/catalog.js')) {
    fail(`${relative} does not load catalog.js`);
  }

  if (!html.includes('../assets/js/cart-checkout.js')) {
    fail(`${relative} does not load cart-checkout.js`);
  }
});

const currentDrop = catalog.getCurrentDrop();
if (!currentDrop || currentDrop.shopVisible === false) {
  fail('Current limited drop is hidden from the shop collection');
}
if (!currentDrop || !currentDrop.pagePath) {
  fail('Current limited drop has no product-detail route');
}

const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!/data-limited-drop-detail/.test(home)) {
  fail('Homepage limited-drop card has no product-detail link');
}

const shopScript = fs.readFileSync(path.join(root, 'assets/js/shop.js'), 'utf8');
if (/product\.isLimitedDrop\s*\|\|\s*product\.shopVisible\s*===\s*false/.test(shopScript)) {
  fail('Shop collection still explicitly excludes limited drops');
}

if (failures.length) {
  console.error('Catalog validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Catalog validation passed for ${catalog.listProducts().length} products.`);
