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

  function categoryForProduct(product) {
    if (!product) return 'jigs';
    if (CATEGORIES.indexOf(product.category) > 0) return product.category;

    var type = normalizeKey(product.productType);
    var tags = normalizedTags(product);
    var identity = normalizeKey([
      product.handle,
      product.key,
      product.title
    ].filter(Boolean).join(' '));
    var optionNames = (product.optionNames || product.options || []).map(function (option) {
      return normalizeKey(typeof option === 'string' ? option : option && option.name);
    });

    if (
      tags.some(function (tag) { return /^(category-)?(apparel|merch|gear)$/.test(tag); }) ||
      /apparel|merch|accessor|shirt|tee|t-shirt|hoodie|windbreaker|beanie|hat|cap|headwear|water-bottle|tumbler|magnet|mouse-pad|tote|bag|duffel|backpack/.test(type + ' ' + identity)
    ) return 'apparel';

    if (
      tags.some(function (tag) { return /^(category-)?(trailer|trailers|soft-plastic|soft-plastics)$/.test(tag); }) ||
      /trailer|soft-plastic|chopped-craw|craw-pack/.test(type + ' ' + identity)
    ) return 'trailers';

    if (optionNames.includes('size') && tags.includes('apparel')) return 'apparel';
    return 'jigs';
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
