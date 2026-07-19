'use strict';

const fallbackCatalog = require('../assets/js/catalog.js');
const { hasPrivateCatalogAccess, storefrontRequest } = require('./shopify-storefront.js');

const CACHE_TTL_MS = 45 * 1000;
const STALE_TTL_MS = 5 * 60 * 1000;
const DROP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
let cache = null;

const BASIC_PRODUCT_FIELDS = `
  id
  handle
  title
  description
  productType
  vendor
  createdAt
  publishedAt
  updatedAt
  featuredImage { url altText width height }
  options { name optionValues { name } }
  variants(first: 250) {
    nodes {
      id
      title
      availableForSale
      price { amount currencyCode }
      selectedOptions { name value }
      image { url altText width height }
    }
  }
`;

const CATALOG_QUERY = `
  query BassBingeCatalog {
    products(first: 100, sortKey: CREATED_AT, reverse: true) {
      nodes { ${BASIC_PRODUCT_FIELDS} }
    }
  }
`;

const AUTHENTICATED_CATALOG_QUERY = `
  query BassBingeCatalog {
    products(first: 100, sortKey: CREATED_AT, reverse: true) {
      nodes {
        ${BASIC_PRODUCT_FIELDS}
        tags
        metafields(identifiers: [
          { namespace: "bass_binge", key: "drop_starts_at" }
          { namespace: "bass_binge", key: "drop_ends_at" }
          { namespace: "bass_binge", key: "short_description" }
          { namespace: "bass_binge", key: "badge_text" }
        ]) { namespace key value type }
      }
    }
  }
`;

function normalizeKey(value) {
  return fallbackCatalog.normalizeKey(value);
}

function numericId(gid) {
  const match = String(gid || '').match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function optionValue(variant, expectedName) {
  const expected = normalizeKey(expectedName);
  const selected = (variant.selectedOptions || []).find((option) =>
    normalizeKey(option.name) === expected
  );
  return selected ? selected.value : null;
}

function inferColorValue(product, variant) {
  const named = optionValue(variant, 'Color');
  if (named) return named;

  const candidates = variant.selectedOptions || [];
  const fallback = candidates.find((option) => {
    const name = normalizeKey(option.name);
    return name !== 'weight' && name !== 'title';
  });
  return fallback ? fallback.value : null;
}

function inferWeightValue(variant) {
  const named = optionValue(variant, 'Weight');
  if (named) return named;

  const fallback = (variant.selectedOptions || []).find((option) =>
    normalizeKey(option.name).includes('weight')
  );
  return fallback ? fallback.value : null;
}

function colorMatches(localColor, remoteValue) {
  const remote = normalizeKey(remoteValue);
  const checkoutTitle = localColor.checkout && localColor.checkout.title;
  return remote && (
    normalizeKey(localColor.name) === remote ||
    normalizeKey(localColor.key) === remote ||
    normalizeKey(checkoutTitle) === remote
  );
}

function weightMatches(localWeight, remoteValue) {
  const remote = normalizeKey(remoteValue);
  return remote && (
    normalizeKey(localWeight.key) === remote ||
    normalizeKey(localWeight.label) === remote ||
    normalizeKey(`${localWeight.label} oz`) === remote
  );
}

function mapVariant(localProduct, remoteVariant) {
  const colorValue = inferColorValue(localProduct, remoteVariant);
  const weightValue = inferWeightValue(remoteVariant);
  const color = localProduct.colors.find((candidate) => colorMatches(candidate, colorValue));
  const weight = weightValue
    ? localProduct.weights.find((candidate) => weightMatches(candidate, weightValue))
    : fallbackCatalog.getWeight(localProduct, localProduct.defaultWeightKey);

  if (!color || !weight) return null;

  return {
    id: remoteVariant.id,
    variantId: numericId(remoteVariant.id),
    title: remoteVariant.title,
    colorKey: color.key,
    colorName: color.name,
    weightKey: weight.key,
    weightLabel: weight.label,
    price: Number(remoteVariant.price.amount),
    currencyCode: remoteVariant.price.currencyCode,
    available: Boolean(remoteVariant.availableForSale),
    quantityAvailable: null,
    image: remoteVariant.image ? remoteVariant.image.url : null,
    imageAlt: remoteVariant.image ? remoteVariant.image.altText : null
  };
}

function validateKnownProduct(product, errors) {
  product.colors.forEach((color) => {
    product.weights.forEach((weight) => {
      const match = product.variants.find((variant) =>
        variant.colorKey === color.key && variant.weightKey === weight.key
      );
      if (!match) {
        errors.push({
          code: 'missing_variant',
          product: product.handle,
          selection: `${color.name} / ${weight.label} oz`,
          message: `${product.title} is missing Shopify variant ${color.name} / ${weight.label} oz.`
        });
      }
    });
  });
}

function normalizeKnownProduct(localProduct, remoteProduct, errors) {
  if (!remoteProduct) {
    errors.push({
      code: 'missing_product',
      product: localProduct.handle,
      message: `Published Shopify product not found: ${localProduct.handle}.`
    });
    return null;
  }

  const variants = remoteProduct.variants.nodes
    .map((variant) => mapVariant(localProduct, variant))
    .filter(Boolean);
  const defaultVariant = variants.find((variant) =>
    variant.colorKey === localProduct.defaultColorKey &&
    variant.weightKey === localProduct.defaultWeightKey
  ) || variants[0];

  const normalized = {
    ...localProduct,
    title: remoteProduct.title || localProduct.title,
    description: remoteProduct.description || '',
    basePrice: defaultVariant ? defaultVariant.price : localProduct.basePrice,
    featuredImage: remoteProduct.featuredImage
      ? remoteProduct.featuredImage.url
      : localProduct.featuredImage,
    source: 'shopify',
    updatedAt: remoteProduct.updatedAt,
    variants,
    colors: localProduct.colors.map((color) => {
      const colorVariant = variants.find((variant) => variant.colorKey === color.key);
      const remoteImage = colorVariant && colorVariant.image;
      return {
        ...color,
        image: remoteImage || color.image,
        imageAlt: colorVariant && colorVariant.imageAlt,
        checkout: colorVariant ? {
          id: colorVariant.id,
          variantId: colorVariant.variantId,
          title: colorVariant.title
        } : null
      };
    })
  };

  validateKnownProduct(normalized, errors);
  return normalized;
}

function metafieldMap(product) {
  return (product.metafields || []).filter(Boolean).reduce((result, field) => {
    result[field.key] = field.value;
    return result;
  }, {});
}

function isLimitedDrop(product) {
  const tags = product.tags || [];
  return tags.includes('limited-drop') || normalizeKey(product.productType) === 'limited-drop';
}

function getDropState(product, now) {
  const fields = metafieldMap(product);
  const startsAt = fields.drop_starts_at || product.publishedAt || product.createdAt;
  const endsAt = fields.drop_ends_at || null;
  const startTime = startsAt ? Date.parse(startsAt) : NaN;
  const endTime = endsAt ? Date.parse(endsAt) : NaN;
  const available = product.variants.nodes.some((variant) => variant.availableForSale);

  if (Number.isFinite(startTime) && startTime > now) return { state: 'scheduled', startsAt, endsAt };
  if (Number.isFinite(endTime) && endTime <= now) {
    if (now - endTime > DROP_RETENTION_MS) return { state: 'removed', startsAt, endsAt };
    return { state: 'expired', startsAt, endsAt };
  }
  return { state: available ? 'live' : 'sold-out', startsAt, endsAt };
}

function normalizeDrop(product, rattle, errors, now) {
  const fields = metafieldMap(product);
  const state = getDropState(product, now);
  if (state.state === 'scheduled' || state.state === 'removed') return null;

  const hasInvalidDefaultVariant = product.variants.nodes.some((variant) =>
    (variant.selectedOptions || []).some((option) => normalizeKey(option.value) === 'default-title') ||
    !inferColorValue(product, variant) ||
    !inferWeightValue(variant)
  );

  if (hasInvalidDefaultVariant) {
    errors.push({
      code: 'drop_options_incomplete',
      product: product.handle,
      message: `${product.title} needs real Color and Weight options instead of Default Title.`
    });
    return null;
  }

  const variants = product.variants.nodes.map((variant) => {
    const colorValue = inferColorValue(product, variant);
    const weightValue = inferWeightValue(variant);
    return {
      id: variant.id,
      variantId: numericId(variant.id),
      title: variant.title,
      colorKey: normalizeKey(colorValue || 'default'),
      colorName: colorValue || 'Default',
      weightKey: normalizeKey(weightValue || 'default'),
      weightLabel: String(weightValue || '').replace(/\s*oz\.?$/i, '') || 'Default',
      price: Number(variant.price.amount),
      currencyCode: variant.price.currencyCode,
      available: Boolean(variant.availableForSale),
      quantityAvailable: null,
      image: variant.image ? variant.image.url : (product.featuredImage && product.featuredImage.url),
      imageAlt: variant.image ? variant.image.altText : null
    };
  });

  if (!variants.length) {
    errors.push({ code: 'drop_missing_variant', product: product.handle, message: `${product.title} has no variants.` });
    return null;
  }

  const defaultVariant = variants[0];
  return {
    key: `limited-drop-${product.handle}`,
    slug: product.handle,
    handle: product.handle,
    pagePath: '',
    shopVisible: false,
    isLimitedDrop: true,
    title: product.title,
    shortTitle: product.title,
    shortDescription: fields.short_description || product.description || '',
    badgeText: fields.badge_text || 'Limited-time drop',
    basePrice: defaultVariant.price,
    featuredImage: defaultVariant.image,
    defaultColorKey: defaultVariant.colorKey,
    defaultWeightKey: defaultVariant.weightKey,
    source: 'shopify',
    drop: state,
    variants,
    colors: Array.from(new Map(variants.map((variant) => [variant.colorKey, {
      key: variant.colorKey,
      name: variant.colorName,
      swatch: '#51433f',
      image: variant.image,
      imageAlt: variant.imageAlt,
      checkout: { id: variant.id, variantId: variant.variantId, title: variant.title }
    }])).values()),
    weights: Array.from(new Map(variants.map((variant) => [variant.weightKey, {
      key: variant.weightKey,
      label: variant.weightLabel,
      priceDelta: 0
    }])).values()),
    rattle: rattle && (product.tags || []).includes('rattle-enabled') ? {
      available: rattle.available,
      defaultKey: 'no',
      options: [
        { key: 'no', label: 'No', priceDelta: 0 },
        { key: 'yes', label: 'Yes', priceDelta: rattle.price }
      ]
    } : { available: false, defaultKey: 'no', options: [{ key: 'no', label: 'No', priceDelta: 0 }] }
  };
}

function normalizeRattle(product) {
  if (!product) return null;
  const variant = product.variants.nodes[0];
  if (!variant) return null;
  return {
    merchandiseId: variant.id,
    variantId: numericId(variant.id),
    price: Number(variant.price.amount),
    currencyCode: variant.price.currencyCode,
    available: Boolean(variant.availableForSale),
    quantityAvailable: null
  };
}

// Transitional support for the currently published Heartlander product. It
// keeps today's drop live while the merchant adds the tag, metafields, and real
// Color/Weight options required by the reusable limited-drop workflow.
function normalizeLegacyHeartlander(remoteProduct) {
  if (!remoteProduct || !remoteProduct.variants.nodes.length) return null;

  const localProduct = fallbackCatalog.getProduct('heartlander-limited-drop');
  const remoteVariant = remoteProduct.variants.nodes[0];
  const image = remoteVariant.image
    ? remoteVariant.image.url
    : remoteProduct.featuredImage
      ? remoteProduct.featuredImage.url
      : localProduct.featuredImage;
  const variant = {
    id: remoteVariant.id,
    variantId: numericId(remoteVariant.id),
    title: remoteVariant.title,
    colorKey: localProduct.defaultColorKey,
    colorName: localProduct.colors[0].name,
    weightKey: localProduct.defaultWeightKey,
    weightLabel: localProduct.weights[0].label,
    price: Number(remoteVariant.price.amount),
    currencyCode: remoteVariant.price.currencyCode,
    available: Boolean(remoteVariant.availableForSale),
    quantityAvailable: null,
    image,
    imageAlt: remoteVariant.image ? remoteVariant.image.altText : null
  };

  return {
    ...localProduct,
    basePrice: variant.price,
    featuredImage: image,
    source: 'shopify',
    updatedAt: remoteProduct.updatedAt,
    drop: {
      state: variant.available ? 'live' : 'sold-out',
      startsAt: remoteProduct.publishedAt || remoteProduct.createdAt,
      endsAt: null
    },
    variants: [variant],
    colors: localProduct.colors.map((color) => ({
      ...color,
      image,
      imageAlt: variant.imageAlt,
      checkout: {
        id: variant.id,
        variantId: variant.variantId,
        title: variant.title
      }
    }))
  };
}

async function loadFreshCatalog(request) {
  const authenticated = hasPrivateCatalogAccess();
  const errors = [];
  let authenticatedFieldsAvailable = authenticated;
  let data;

  try {
    data = await storefrontRequest(
      authenticated ? AUTHENTICATED_CATALOG_QUERY : CATALOG_QUERY,
      {},
      request
    );
  } catch (error) {
    if (!authenticated) throw error;
    authenticatedFieldsAvailable = false;
    errors.push({
      code: 'storefront_token_permissions',
      message: 'The Storefront token cannot read tags/metafields; verify its product, tag, and metafield permissions.'
    });
    data = await storefrontRequest(CATALOG_QUERY, {}, request);
  }
  const remoteProducts = data.products.nodes;
  const remoteByHandle = new Map(remoteProducts.map((product) => [product.handle, product]));
  const localProducts = fallbackCatalog.listProducts().filter((product) => !product.isLimitedDrop);
  const products = localProducts
    .map((localProduct) => normalizeKnownProduct(localProduct, remoteByHandle.get(localProduct.handle), errors))
    .filter(Boolean);
  const rattleProduct = remoteProducts.find((product) =>
    product.handle === 'rattle-add-on' || normalizeKey(product.productType) === 'rattle-add-on'
  );
  const rattle = normalizeRattle(rattleProduct);
  const legacyDrop = remoteByHandle.get('limited-drop');

  if (!rattle) {
    errors.push({
      code: 'missing_rattle_add_on',
      product: 'rattle-add-on',
      message: 'Published Shopify Rattle Add-on product not found.'
    });
  }

  if (!authenticatedFieldsAvailable && legacyDrop) {
    errors.push({
      code: 'limited_drop_auth_required',
      product: 'limited-drop',
      message: 'The current Heartlander works, but future tagged/metafield-driven drops require a Storefront token.'
    });
  } else if (authenticatedFieldsAvailable && legacyDrop && !isLimitedDrop(legacyDrop)) {
    errors.push({
      code: 'limited_drop_tag_missing',
      product: 'limited-drop',
      message: 'Heartlander needs the limited-drop tag or Limited Drop product type.'
    });
  }

  const drops = authenticatedFieldsAvailable
    ? remoteProducts
        .filter(isLimitedDrop)
        .map((product) => normalizeDrop(product, rattle, errors, Date.now()))
        .filter(Boolean)
        .sort((left, right) => Date.parse(right.drop.startsAt || 0) - Date.parse(left.drop.startsAt || 0))
    : [];
  const currentDrop = drops[0] || normalizeLegacyHeartlander(legacyDrop);

  return {
    ok: true,
    source: 'shopify',
    fetchedAt: new Date().toISOString(),
    cacheTtlSeconds: CACHE_TTL_MS / 1000,
    products,
    rattle,
    drops,
    currentDrop,
    errors
  };
}

async function getCatalog(request) {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return { ...cache.value, cache: 'hit' };
  }

  try {
    const value = await loadFreshCatalog(request);
    cache = { loadedAt: now, value };
    return { ...value, cache: 'miss' };
  } catch (error) {
    if (cache && now - cache.loadedAt < STALE_TTL_MS) {
      return {
        ...cache.value,
        cache: 'stale',
        errors: cache.value.errors.concat({
          code: 'shopify_upstream_stale',
          message: 'Serving a recent catalog because Shopify is temporarily unavailable.'
        })
      };
    }
    throw error;
  }
}

function clearCatalogCache() {
  cache = null;
}

module.exports = { clearCatalogCache, getCatalog, loadFreshCatalog };
