'use strict';

const { randomUUID } = require('node:crypto');
const fallbackCatalog = require('../assets/js/catalog.js');
const { normalizeCatalogEnvelope } = require('./catalog-envelope.js');
const { hasPrivateCatalogAccess, storefrontRequest } = require('./shopify-storefront.js');

const CACHE_TTL_MS = 45 * 1000;
const STALE_TTL_MS = 5 * 60 * 1000;
const DROP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
let cache = null;

const BASIC_VARIANT_FIELDS = `
  id
  title
  availableForSale
  price { amount currencyCode }
  compareAtPrice { amount currencyCode }
  selectedOptions { name value }
  image { id url altText width height }
`;

const AUTHENTICATED_VARIANT_FIELDS = `
  ${BASIC_VARIANT_FIELDS}
  quantityAvailable
`;

const MEDIA_FIELDS = `
  nodes {
    __typename
    id
    alt
    ... on MediaImage {
      image { id url altText width height }
    }
    ... on Video {
      sources { url mimeType format height width }
    }
    ... on ExternalVideo {
      host
      embedUrl
      originUrl
    }
    ... on Model3d {
      sources { url mimeType format filesize }
    }
  }
  pageInfo { hasNextPage endCursor }
`;

const BASIC_PRODUCT_FIELDS = `
  id
  handle
  title
  description
  descriptionHtml
  productType
  vendor
  createdAt
  publishedAt
  updatedAt
  availableForSale
  featuredImage { url altText width height }
  featuredMedia { id }
  media(first: 100) {
    ${MEDIA_FIELDS}
  }
  options { id name optionValues { id name } }
`;

const CATALOG_QUERY = `
  query BassBingeCatalogPage($after: String) {
    products(first: 100, after: $after, sortKey: CREATED_AT, reverse: true) {
      edges {
        cursor
        node {
          ${BASIC_PRODUCT_FIELDS}
          variants(first: 100) {
            nodes { ${BASIC_VARIANT_FIELDS} }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const AUTHENTICATED_CATALOG_QUERY = `
  query BassBingeCatalogPage($after: String) {
    products(first: 100, after: $after, sortKey: CREATED_AT, reverse: true) {
      edges {
        cursor
        node {
          ${BASIC_PRODUCT_FIELDS}
          tags
          metafields(identifiers: [
            { namespace: "bass_binge", key: "drop_starts_at" }
            { namespace: "bass_binge", key: "drop_ends_at" }
            { namespace: "bass_binge", key: "short_description" }
            { namespace: "bass_binge", key: "badge_text" }
            { namespace: "bass_binge", key: "option_roles" }
            { namespace: "bass_binge", key: "swatches" }
          ]) { namespace key value type }
          variants(first: 100) {
            nodes { ${AUTHENTICATED_VARIANT_FIELDS} }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

function variantsPageQuery(authenticated) {
  return `
    query BassBingeProductVariantsPage($id: ID!, $after: String) {
      product: node(id: $id) {
        ... on Product {
          variants(first: 100, after: $after) {
            nodes { ${authenticated ? AUTHENTICATED_VARIANT_FIELDS : BASIC_VARIANT_FIELDS} }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }
  `;
}

const MEDIA_PAGE_QUERY = `
  query BassBingeProductMediaPage($id: ID!, $after: String) {
    product: node(id: $id) {
      ... on Product {
        media(first: 100, after: $after) {
          ${MEDIA_FIELDS}
        }
      }
    }
  }
`;

async function loadConnectionPages(connection, loadNextPage) {
  const nodes = Array.isArray(connection && connection.nodes) ? connection.nodes.slice() : [];
  let pageInfo = connection && connection.pageInfo || {};
  const seenCursors = new Set();
  while (pageInfo.hasNextPage) {
    const cursor = pageInfo.endCursor;
    if (!cursor || seenCursors.has(cursor)) {
      throw new Error('Shopify returned an invalid or repeated connection cursor.');
    }
    seenCursors.add(cursor);
    const next = await loadNextPage(cursor);
    nodes.push(...(Array.isArray(next && next.nodes) ? next.nodes : []));
    pageInfo = next && next.pageInfo || {};
  }
  return { nodes, pageInfo: { hasNextPage: false, endCursor: pageInfo.endCursor || null } };
}

async function loadShopifyProducts({ authenticated, request, requester }) {
  const query = authenticated ? AUTHENTICATED_CATALOG_QUERY : CATALOG_QUERY;
  const products = [];
  let after = null;
  let hasNextPage = true;
  const seenCursors = new Set();

  while (hasNextPage) {
    const data = await requester(query, { after }, request);
    const connection = data && data.products || {};
    const edges = Array.isArray(connection.edges) ? connection.edges : [];
    products.push(...edges.map((edge) => edge.node).filter(Boolean));
    hasNextPage = Boolean(connection.pageInfo && connection.pageInfo.hasNextPage);
    after = connection.pageInfo && connection.pageInfo.endCursor || null;
    if (hasNextPage && (!after || seenCursors.has(after))) {
      throw new Error('Shopify returned an invalid or repeated product cursor.');
    }
    if (after) seenCursors.add(after);
  }

  for (const product of products) {
    product.variants = await loadConnectionPages(product.variants, async (cursor) => {
      const data = await requester(variantsPageQuery(authenticated), {
        id: product.id,
        after: cursor
      }, request);
      return data && data.product && data.product.variants;
    });
    product.media = await loadConnectionPages(product.media, async (cursor) => {
      const data = await requester(MEDIA_PAGE_QUERY, {
        id: product.id,
        after: cursor
      }, request);
      return data && data.product && data.product.media;
    });
  }

  return products;
}

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
    pagePath: 'products/limited-drop',
    shopVisible: true,
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

function normalizeDiscoveredProduct(remoteProduct, errors) {
  if (!remoteProduct || !remoteProduct.variants || !remoteProduct.variants.nodes.length) {
    return null;
  }

  const variants = remoteProduct.variants.nodes.map((variant) => {
    const colorValue = inferColorValue(remoteProduct, variant);
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
      image: variant.image ? variant.image.url : (remoteProduct.featuredImage && remoteProduct.featuredImage.url),
      imageAlt: variant.image ? variant.image.altText : null
    };
  });

  const defaultVariant = variants[0];
  const weights = Array.from(new Map(variants.map((v) => [v.weightKey, {
    key: v.weightKey, label: v.weightLabel, priceDelta: 0
  }])).values());
  const colors = Array.from(new Map(variants.map((v) => [v.colorKey, {
    key: v.colorKey,
    name: v.colorName,
    swatch: '#51433f',
    image: v.image,
    imageAlt: v.imageAlt,
    checkout: { id: v.id, variantId: v.variantId, title: v.title }
  }])).values());

  return {
    key: normalizeKey(remoteProduct.handle),
    legacyProductId: remoteProduct.handle,
    legacyShopifyKey: remoteProduct.handle,
    slug: normalizeKey(remoteProduct.handle),
    handle: remoteProduct.handle,
    pagePath: 'products/' + remoteProduct.handle,
    title: remoteProduct.title,
    shortTitle: remoteProduct.title,
    search: remoteProduct.title + ' ' + colors.map((c) => c.name).join(' '),
    basePrice: defaultVariant.price,
    featuredImage: defaultVariant.image,
    defaultColorKey: defaultVariant.colorKey,
    defaultWeightKey: defaultVariant.weightKey,
    rattle: { available: false, defaultKey: 'no', options: [
      { key: 'no', label: 'No', priceDelta: 0 }
    ] },
    weights: weights,
    colors: Array.from(colors),
    description: remoteProduct.description || '',
    source: 'shopify',
    updatedAt: remoteProduct.updatedAt,
    variants: variants
  };
}

async function loadFreshCatalog(request, options = {}) {
  const requester = options.storefrontRequest || storefrontRequest;
  const authenticated = options.authenticated === undefined
    ? hasPrivateCatalogAccess()
    : Boolean(options.authenticated);
  const errors = [];
  let authenticatedFieldsAvailable = authenticated;
  let remoteProducts;

  try {
    remoteProducts = await loadShopifyProducts({
      authenticated,
      request,
      requester
    });
  } catch (error) {
    if (!authenticated) throw error;
    authenticatedFieldsAvailable = false;
    errors.push({
      code: 'storefront_token_permissions',
      message: 'The Storefront token cannot read tags/metafields; verify its product, tag, and metafield permissions.'
    });
    remoteProducts = await loadShopifyProducts({
      authenticated: false,
      request,
      requester
    });
  }

  const generatedAt = options.generatedAt || new Date().toISOString();
  const envelope = normalizeCatalogEnvelope(remoteProducts, {
    generatedAt,
    requestId: options.requestId || randomUUID(),
    ttlSeconds: CACHE_TTL_MS / 1000
  });
  const remoteByHandle = new Map(remoteProducts.map((product) => [product.handle, product]));
  const localProducts = fallbackCatalog.listProducts().filter((product) => !product.isLimitedDrop);
  const knownHandles = new Set(localProducts.map((product) => product.handle));
  const products = localProducts
    .map((localProduct) => normalizeKnownProduct(localProduct, remoteByHandle.get(localProduct.handle), errors))
    .filter(Boolean);

  // Auto-discover Shopify products that have no local fallback entry.
  const dropHandles = new Set();
  if (authenticatedFieldsAvailable) {
    remoteProducts.filter(isLimitedDrop).forEach((product) => dropHandles.add(product.handle));
  }
  dropHandles.add('limited-drop');
  dropHandles.add('rattle-add-on');
  const discoveredProducts = remoteProducts
    .filter((product) => !knownHandles.has(product.handle) && !dropHandles.has(product.handle) && normalizeKey(product.productType) !== 'rattle-add-on')
    .map((product) => normalizeDiscoveredProduct(product, errors))
    .filter(Boolean);
  products.push(...discoveredProducts);
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

  const legacy = {
    ok: true,
    source: 'shopify',
    fetchedAt: generatedAt,
    cacheTtlSeconds: CACHE_TTL_MS / 1000,
    products,
    rattle,
    drops,
    currentDrop,
    errors
  };

  return {
    ok: true,
    source: 'shopify',
    ...envelope,
    legacy
  };
}

async function getCatalog(request) {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    const ageSeconds = Math.max(0, Math.floor((now - cache.loadedAt) / 1000));
    return {
      ...cache.value,
      cache: 'hit',
      requestId: randomUUID(),
      freshness: { ...cache.value.freshness, ageSeconds }
    };
  }

  try {
    const value = await loadFreshCatalog(request);
    cache = { loadedAt: now, value };
    return { ...value, cache: 'miss' };
  } catch (error) {
    if (cache && now - cache.loadedAt < STALE_TTL_MS) {
      const observedAt = new Date(now).toISOString();
      const staleIssue = {
        productId: null,
        handle: null,
        severity: 'warning',
        code: 'shopify_upstream_stale',
        field: null,
        message: 'Serving a recent catalog because Shopify is temporarily unavailable.',
        remedy: 'Retry after Shopify Storefront API connectivity recovers.',
        variantId: null,
        observedAt
      };
      return {
        ...cache.value,
        cache: 'stale',
        requestId: randomUUID(),
        stale: true,
        freshness: {
          ...cache.value.freshness,
          status: 'stale',
          ageSeconds: Math.max(0, Math.floor((now - cache.loadedAt) / 1000))
        },
        quarantine: cache.value.quarantine.concat(staleIssue),
        outcomes: {
          ...cache.value.outcomes,
          warning: cache.value.outcomes.warning.concat(staleIssue)
        },
        legacy: {
          ...cache.value.legacy,
          errors: cache.value.legacy.errors.concat({
            code: staleIssue.code,
            message: staleIssue.message
          })
        }
      };
    }
    throw error;
  }
}

function clearCatalogCache() {
  cache = null;
}

module.exports = {
  clearCatalogCache,
  getCatalog,
  loadFreshCatalog,
  loadShopifyProducts
};
