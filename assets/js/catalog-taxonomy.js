(function (root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.BassBingeTaxonomy = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var CATEGORIES = ['all', 'jigs', 'trailers', 'apparel'];

  function normalizeKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function normalizedTags(product) {
    return (Array.isArray(product && product.tags) ? product.tags : []).map(normalizeKey);
  }

  function hasAnyTerm(value, terms) {
    var normalized = '-' + normalizeKey(value) + '-';
    return terms.some(function (term) {
      return normalized.includes('-' + normalizeKey(term) + '-');
    });
  }

  function shopifyCategoryText(product) {
    var category = product && product.shopifyCategory;
    if (!category && product && product.category && typeof product.category === 'object') {
      category = product.category;
    }
    if (!category || typeof category !== 'object') return '';
    return [category].concat(Array.isArray(category.ancestors) ? category.ancestors : [])
      .map(function (entry) { return entry && entry.name; })
      .filter(Boolean)
      .join(' ');
  }

  function categoryForProduct(product) {
    if (!product) return 'jigs';
    if (CATEGORIES.indexOf(product.category) > 0) return product.category;

    var type = normalizeKey(product.productType);
    var tags = normalizedTags(product);
    var shopifyCategory = shopifyCategoryText(product);
    var identity = normalizeKey([
      product.handle,
      product.key,
      product.title
    ].filter(Boolean).join(' '));

    if (tags.some(function (tag) { return /^(category-)?(apparel|merch|gear)$/.test(tag); })) return 'apparel';
    if (tags.some(function (tag) { return /^(category-)?(trailer|trailers|soft-plastic|soft-plastics)$/.test(tag); })) return 'trailers';
    if (tags.some(function (tag) { return /^(category-)?jigs?$/.test(tag); })) return 'jigs';

    if (hasAnyTerm(shopifyCategory, ['soft-plastic-bait', 'soft-plastic-baits'])) return 'trailers';
    if (hasAnyTerm(shopifyCategory, ['artificial-fishing-jig', 'artificial-fishing-jigs'])) return 'jigs';
    if (hasAnyTerm(shopifyCategory, [
      'apparel', 'clothing', 'drinkware', 'coffee', 'cup', 'cups', 'drink-sleeve',
      'drink-sleeves', 'bottle-sleeve', 'bottle-sleeves', 'bag', 'bags'
    ])) return 'apparel';

    if (hasAnyTerm(type, [
      'apparel', 'merch', 'gear', 'accessory', 'accessories', 'clothing', 'drinkware'
    ])) return 'apparel';
    if (hasAnyTerm(type, ['trailer', 'trailers', 'soft-plastic', 'soft-plastics'])) return 'trailers';
    if (hasAnyTerm(type, ['jig', 'jigs'])) return 'jigs';

    if (hasAnyTerm(identity, [
      'apparel', 'merch', 'accessory', 'accessories', 'shirt', 'tee', 't-shirt',
      'hoodie', 'sweatshirt', 'windbreaker', 'beanie', 'hat', 'cap', 'headwear',
      'water-bottle', 'bottle', 'tumbler', 'magnet', 'mouse-pad', 'mug', 'cup',
      'drinkware', 'koozie', 'can-cooler', 'drink-sleeve', 'bag', 'tote',
      'keychain', 'sticker', 'decal', 'coaster'
    ])) return 'apparel';
    if (hasAnyTerm(identity, [
      'trailer', 'trailers', 'soft-plastic', 'soft-plastics', 'chopped-craw', 'craw-pack'
    ])) return 'trailers';
    if (hasAnyTerm(identity, [
      'jig', 'jigs', 'football', 'spider', 'finesse-jig', 'pee-wee-flip'
    ])) return 'jigs';

    return 'apparel';
  }

  function shopCategoryFromPath(pathname) {
    var match = String(pathname || '').match(/\/shop\/(jigs|trailers|apparel)\/?$/i);
    return match ? match[1].toLowerCase() : 'all';
  }

  function categoryLabel(category) {
    return {
      all: 'All Products',
      jigs: 'Jigs',
      trailers: 'Jig Trailers',
      apparel: 'Apparel & Gear'
    }[category] || 'All Products';
  }

  function relatedProducts(products, currentProduct, limit) {
    var currentCategory = categoryForProduct(currentProduct);
    var candidates = (products || []).filter(function (product) {
      return product && currentProduct && product.handle !== currentProduct.handle && product.shopVisible !== false;
    });
    var ranked = candidates.map(function (product, index) {
      var category = categoryForProduct(product);
      var score = 0;
      if (currentCategory === 'jigs') {
        if (category === 'trailers') score += 100;
        if (category === 'jigs') score += 40;
        if (category === 'apparel') score += 10;
      } else if (currentCategory === 'trailers') {
        if (category === 'jigs') score += /\+/.test(product.title || '') ? 100 : 70;
        if (category === 'trailers') score += 30;
      } else {
        if (category === 'apparel') score += 100;
        if (category === 'jigs') score += 30;
      }
      if (product.isLimitedDrop) score += 5;
      return { product: product, score: score, index: index };
    });
    ranked.sort(function (left, right) {
      return right.score - left.score || left.index - right.index;
    });
    return ranked.slice(0, limit || 3).map(function (entry) { return entry.product; });
  }

  return {
    categories: CATEGORIES.slice(),
    normalizeKey: normalizeKey,
    categoryForProduct: categoryForProduct,
    shopCategoryFromPath: shopCategoryFromPath,
    categoryLabel: categoryLabel,
    relatedProducts: relatedProducts
  };
});
