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
  var DEPARTMENTS = ['fishing', 'lifestyle-and-gear'];
  var SUBCATEGORIES = ['jigs', 'trailers', 'apparel', 'headwear', 'drinkware', 'bags', 'accessories'];
  var PRODUCT_TYPE_SUBCATEGORY = {
    jig: 'jigs',
    trailer: 'trailers',
    apparel: 'apparel',
    headwear: 'headwear',
    drinkware: 'drinkware',
    bag: 'bags',
    accessory: 'accessories'
  };

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

  function tagNamesSubcategory(tags, subcategory) {
    var singular = subcategory.replace(/s$/, '');
    return tags.some(function (tag) {
      return tag === subcategory || tag === singular ||
        tag === 'category-' + subcategory || tag === 'category-' + singular;
    });
  }

  function subcategoryForProduct(product) {
    if (!product) return 'jigs';

    var type = normalizeKey(product.productType);
    var tags = normalizedTags(product);
    var explicitSubcategory = normalizeKey(product.subcategory);
    var legacyCategory = normalizeKey(product.category);
    var shopifyCategory = shopifyCategoryText(product);
    var identity = normalizeKey([
      product.handle,
      product.key,
      product.title
    ].filter(Boolean).join(' '));

    if (SUBCATEGORIES.includes(explicitSubcategory)) return explicitSubcategory;
    if (legacyCategory !== 'apparel' && SUBCATEGORIES.includes(legacyCategory)) return legacyCategory;

    if (tagNamesSubcategory(tags, 'headwear')) return 'headwear';
    if (tagNamesSubcategory(tags, 'drinkware')) return 'drinkware';
    if (tagNamesSubcategory(tags, 'bags')) return 'bags';
    if (tagNamesSubcategory(tags, 'accessories')) return 'accessories';
    if (tagNamesSubcategory(tags, 'apparel') || tags.includes('merch') || tags.includes('gear')) return 'apparel';
    if (tagNamesSubcategory(tags, 'trailers') || tags.includes('soft-plastic') || tags.includes('soft-plastics')) return 'trailers';
    if (tagNamesSubcategory(tags, 'jigs')) return 'jigs';

    if (hasAnyTerm(shopifyCategory, ['soft-plastic-bait', 'soft-plastic-baits'])) return 'trailers';
    if (hasAnyTerm(shopifyCategory, ['artificial-fishing-jig', 'artificial-fishing-jigs'])) return 'jigs';
    if (hasAnyTerm(shopifyCategory, ['headwear', 'hat', 'hats', 'cap', 'caps', 'beanie', 'beanies'])) return 'headwear';
    if (hasAnyTerm(shopifyCategory, [
      'drinkware', 'coffee', 'tea', 'cup', 'cups', 'mug', 'mugs', 'drink-sleeve',
      'drink-sleeves', 'bottle-sleeve', 'bottle-sleeves'
    ])) return 'drinkware';
    if (hasAnyTerm(shopifyCategory, ['bag', 'bags', 'tote', 'totes', 'backpack', 'backpacks', 'luggage'])) return 'bags';
    if (hasAnyTerm(shopifyCategory, ['apparel', 'clothing', 'shirt', 'shirts', 'outerwear', 'sweater', 'sweaters'])) return 'apparel';

    if (PRODUCT_TYPE_SUBCATEGORY[type]) return PRODUCT_TYPE_SUBCATEGORY[type];

    if (hasAnyTerm(identity, ['trailer', 'trailers', 'soft-plastic', 'soft-plastics', 'chopped-craw', 'craw-pack'])) return 'trailers';
    if (hasAnyTerm(identity, ['beanie', 'hat', 'cap', 'headwear'])) return 'headwear';
    if (hasAnyTerm(identity, [
      'water-bottle', 'bottle', 'tumbler', 'drinkware', 'mug', 'mugs', 'cup', 'cups',
      'koozie', 'koozies', 'can-cooler', 'drink-sleeve', 'beverage-holder'
    ])) return 'drinkware';
    if (hasAnyTerm(identity, ['tote', 'bag', 'duffel', 'backpack'])) return 'bags';
    if (hasAnyTerm(identity, ['accessory', 'accessories', 'magnet', 'mouse-pad', 'rattle-add-on', 'keychain', 'sticker', 'decal', 'coaster'])) return 'accessories';
    if (hasAnyTerm(identity, ['apparel', 'merch', 'shirt', 'tee', 't-shirt', 'hoodie', 'sweatshirt', 'windbreaker', 'raglan'])) return 'apparel';
    if (hasAnyTerm(identity, ['jig', 'jigs', 'football', 'spider', 'finesse-jig', 'pee-wee-flip'])) return 'jigs';

    if (legacyCategory === 'apparel') return 'apparel';
    return 'accessories';
  }

  function departmentForSubcategory(subcategory) {
    return subcategory === 'jigs' || subcategory === 'trailers'
      ? 'fishing'
      : 'lifestyle-and-gear';
  }

  function classificationForProduct(product) {
    var subcategory = subcategoryForProduct(product);
    return {
      department: departmentForSubcategory(subcategory),
      subcategory: subcategory
    };
  }

  function departmentForProduct(product) {
    return classificationForProduct(product).department;
  }

  function categoryForProduct(product) {
    var subcategory = subcategoryForProduct(product);
    return subcategory === 'jigs' || subcategory === 'trailers' ? subcategory : 'apparel';
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
    departments: DEPARTMENTS.slice(),
    subcategories: SUBCATEGORIES.slice(),
    normalizeKey: normalizeKey,
    classificationForProduct: classificationForProduct,
    departmentForProduct: departmentForProduct,
    subcategoryForProduct: subcategoryForProduct,
    categoryForProduct: categoryForProduct,
    shopCategoryFromPath: shopCategoryFromPath,
    categoryLabel: categoryLabel,
    relatedProducts: relatedProducts
  };
});
