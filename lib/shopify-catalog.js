'use strict';

const { randomUUID } = require('node:crypto');
const {
  createCatalogStoreFromEnv,
  createMemoryCatalogStore
} = require('./catalog-durable-store.js');
const { normalizeCatalogEnvelope } = require('./catalog-envelope.js');
const { createCatalogService } = require('./catalog-freshness.js');
const {
  CatalogNamespaceConfigurationError,
  deriveCatalogNamespace
} = require('./catalog-namespace.js');
const { hasPrivateCatalogAccess, storefrontRequest } = require('./shopify-storefront.js');
const taxonomy = require('../assets/js/catalog-taxonomy.js');

const CACHE_TTL_MS = 45 * 1000;
const DROP_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
let defaultCatalogService = null;

const COLOR_SWATCHES = {
  'heartlander': '#51433f',
  'green-pumpkin': '#59604a',
  'pbj': 'linear-gradient(135deg, #795943 0 50%, #59445f 50% 100%)',
  'watermelon-candy': '#6b7353',
  'rootbeer': '#765038',
  'cinnamon-purple': '#6a4c63',
  'blackberry-smoothie': '#2d1631',
  'magic-brownie': '#5b3f2f',
  'magic-brownie-fine': '#5b3f2f',
  'ryry-special': '#6a4e43',
  'ryry-special-fine': '#6a4e43',
  'biggie-smalls': '#2f2b25',
  'a-little-lit': '#79513a',
  'ogre': '#505237',
  'fruit-fly': '#6b7365',
  'craw-essence': '#8a4830',
  'bad-bo': '#22352a',
  'lit': '#a75c32',
  'pbj-lite': '#5d4a67',
  'smokin-pb': '#4d4138',
  'cool-breeze': '#4a7c8c',
  'blue-blood': '#3a4a6c'
};

const STOREFRONT_PRESENTATION = {
  '5-8-oz-heavy-cover-football': {
    key: '5-8-oz-heavy-cover-football',
    pagePath: 'products/5-8-oz-heavy-cover-football',
    fixedWeight: { key: '5-8', label: '5/8' }
  },
  'pee-wee-football': {
    key: 'pee-wee-football',
    pagePath: 'products/pee-wee-football'
  },
  '5-16-oz-finesse-jig': {
    key: 'finesse-jig',
    pagePath: 'products/finesse-jig',
    fixedWeight: { key: '5-16', label: '5/16' }
  },
  '5-16-peewee-spider-hd-finesse-cut': {
    key: 'peewee-spider-hd',
    pagePath: 'products/peewee-spider-hd',
    fixedWeight: { key: '5-16', label: '5/16' }
  },
  '7-16-oz-peewee-football-jig': {
    key: 'peewee-football',
    pagePath: 'products/peewee-football'
  },
  '3-4-oz-football-jig': {
    key: 'heavy-cover-football',
    pagePath: 'products/heavy-cover-football',
    fixedWeight: { key: '3-4', label: '3/4' }
  },
  'premium-football-jig': {
    key: 'peewee-football-hd',
    pagePath: 'products/peewee-football-hd',
    fixedWeight: { key: '1-2', label: '1/2' }
  }
};

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
  featuredImage { id url altText width height }
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
          id
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
        id
        media(first: 100, after: $after) {
          ${MEDIA_FIELDS}
        }
      }
    }
  }
`;

function malformedConnection(label, detail) {
  return new Error(`Shopify returned a malformed ${label} connection: ${detail}.`);
}

function validatePageInfo(pageInfo, label) {
  if (!pageInfo || typeof pageInfo !== 'object' || Array.isArray(pageInfo)) {
    throw malformedConnection(label, 'pageInfo is missing');
  }
  if (typeof pageInfo.hasNextPage !== 'boolean') {
    throw malformedConnection(label, 'hasNextPage must be a boolean');
  }
  if (
    pageInfo.endCursor !== null &&
    typeof pageInfo.endCursor !== 'string'
  ) {
    throw malformedConnection(label, 'endCursor must be a string or null');
  }
  if (pageInfo.hasNextPage && !pageInfo.endCursor) {
    throw malformedConnection(label, 'a continuation cursor is missing');
  }
  return pageInfo;
}

function validateNodeConnection(connection, label) {
  if (!connection || typeof connection !== 'object' || Array.isArray(connection)) {
    throw malformedConnection(label, 'connection is missing');
  }
  if (!Array.isArray(connection.nodes)) {
    throw malformedConnection(label, 'nodes are missing');
  }
  if (connection.nodes.some((node) => !node || typeof node !== 'object' || Array.isArray(node))) {
    throw malformedConnection(label, 'a node is missing');
  }
  return {
    nodes: connection.nodes,
    pageInfo: validatePageInfo(connection.pageInfo, label)
  };
}

function validateProductConnection(connection, seenEdgeCursors) {
  const label = 'product';
  if (!connection || typeof connection !== 'object' || Array.isArray(connection)) {
    throw malformedConnection(label, 'connection is missing');
  }
  if (!Array.isArray(connection.edges)) {
    throw malformedConnection(label, 'edges are missing');
  }
  const pageInfo = validatePageInfo(connection.pageInfo, label);
  for (const edge of connection.edges) {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
      throw malformedConnection(label, 'an edge is missing');
    }
    if (typeof edge.cursor !== 'string' || !edge.cursor) {
      throw malformedConnection(label, 'an edge cursor is missing');
    }
    if (seenEdgeCursors.has(edge.cursor)) {
      throw malformedConnection(label, 'an edge cursor was repeated');
    }
    if (!edge.node || typeof edge.node !== 'object' || Array.isArray(edge.node)) {
      throw malformedConnection(label, 'an edge node is missing');
    }
    seenEdgeCursors.add(edge.cursor);
  }
  const expectedEndCursor = connection.edges.length
    ? connection.edges[connection.edges.length - 1].cursor
    : null;
  if (pageInfo.endCursor !== expectedEndCursor) {
    throw new Error('Shopify returned an inconsistent product continuation cursor.');
  }
  return { edges: connection.edges, pageInfo };
}

async function loadConnectionPages(connection, loadNextPage, label) {
  let page = validateNodeConnection(connection, label);
  const nodes = page.nodes.slice();
  let pageInfo = page.pageInfo;
  const seenCursors = new Set();
  while (pageInfo.hasNextPage) {
    const cursor = pageInfo.endCursor;
    if (seenCursors.has(cursor)) {
      throw malformedConnection(label, 'a continuation cursor was repeated');
    }
    seenCursors.add(cursor);
    page = validateNodeConnection(await loadNextPage(cursor), label);
    nodes.push(...page.nodes);
    pageInfo = page.pageInfo;
  }
  return { nodes, pageInfo: { hasNextPage: false, endCursor: pageInfo.endCursor || null } };
}

async function loadProductConnectionPage({
  requester,
  query,
  variables,
  request,
  productId,
  connectionKey,
  label
}) {
  const data = await requester(query, variables, request);
  if (!data || !data.product || data.product.id !== productId) {
    throw new Error(`Shopify returned an inconsistent ${label} continuation product.`);
  }
  return data.product[connectionKey];
}

async function loadShopifyProducts({ authenticated, request, requester }) {
  const query = authenticated ? AUTHENTICATED_CATALOG_QUERY : CATALOG_QUERY;
  const products = [];
  let after = null;
  let hasNextPage = true;
  const seenPageCursors = new Set();
  const seenEdgeCursors = new Set();

  while (hasNextPage) {
    const data = await requester(query, { after }, request);
    const connection = validateProductConnection(
      data && data.products,
      seenEdgeCursors
    );
    products.push(...connection.edges.map((edge) => edge.node));
    hasNextPage = connection.pageInfo.hasNextPage;
    after = connection.pageInfo.endCursor;
    if (hasNextPage && seenPageCursors.has(after)) {
      throw malformedConnection('product', 'a continuation cursor was repeated');
    }
    if (after) seenPageCursors.add(after);
  }

  for (const product of products) {
    product.variants = await loadConnectionPages(
      product.variants,
      (cursor) => loadProductConnectionPage({
        requester,
        query: variantsPageQuery(authenticated),
        variables: { id: product.id, after: cursor },
        request,
        productId: product.id,
        connectionKey: 'variants',
        label: 'variant'
      }),
      'variant'
    );
    product.media = await loadConnectionPages(
      product.media,
      (cursor) => loadProductConnectionPage({
        requester,
        query: MEDIA_PAGE_QUERY,
        variables: { id: product.id, after: cursor },
        request,
        productId: product.id,
        connectionKey: 'media',
        label: 'media'
      }),
      'media'
    );
  }

  return products;
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function numericId(gid) {
  const match = String(gid || '').match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function textFromHtml(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
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
  const description =
    fields.short_description ||
    product.description ||
    textFromHtml(product.descriptionHtml);
  return {
    key: `limited-drop-${product.handle}`,
    slug: product.handle,
    handle: product.handle,
    pagePath: 'products/' + product.handle,
    shopVisible: true,
    isLimitedDrop: true,
    title: product.title,
    shortTitle: product.title,
    productType: product.productType || '',
    tags: Array.isArray(product.tags) ? product.tags.slice() : [],
    category: taxonomy.categoryForProduct(product),
    shortDescription: description,
    description,
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

function normalizeDiscoveredProduct(product) {
  if (!product || !Array.isArray(product.variants) || !product.variants.length) {
    return null;
  }

  const defaultVariant = product.variants[0];
  const media = Array.isArray(product.media) ? product.media : [];
  const image = media.find((item) =>
    item &&
    (item.id === product.featuredMediaId ||
      item.image && item.image.id === product.featuredMediaId) &&
    item.type === 'image' &&
    item.image &&
    item.image.url
  ) || media.find((item) =>
    item && item.type === 'image' && item.image && item.image.url
  );
  const imageById = new Map();
  media.filter((item) =>
    item && item.type === 'image' && item.image && item.image.url
  ).forEach((item) => {
    if (item.id) imageById.set(item.id, item);
    if (item.image.id) imageById.set(item.image.id, item);
  });
  const options = Array.isArray(product.options) ? product.options : [];
  const presentation = STOREFRONT_PRESENTATION[product.handle] || {};
  const colorOption = options.find((option, index) => {
    const name = normalizeKey(option.name);
    return name.includes('color') || (
      index === 0 &&
      !name.includes('weight') &&
      !name.includes('size') &&
      !name.includes('style') &&
      !name.includes('material')
    );
  });
  const weightOption = options.find((option) => normalizeKey(option.name).includes('weight'));
  const supportsJigQuickAdd = Boolean(colorOption && (weightOption || presentation.fixedWeight));
  const supportsExactColorQuickAdd = Boolean(
    colorOption &&
    !weightOption &&
    !presentation.fixedWeight &&
    options.length === 1 &&
    product.variants.every((variant) =>
      Array.isArray(variant.selectedOptions) &&
      variant.selectedOptions.length === 1 &&
      variant.selectedOptions[0].name === colorOption.name
    )
  );
  const supportsQuickAdd = supportsJigQuickAdd || supportsExactColorQuickAdd;
  const variantProjection = product.variants.map((variant) => {
    const selected = new Map(variant.selectedOptions.map((option) => [
      option.name,
      option.value
    ]));
    const variantImageUrl = variant.image && variant.image.url || null;
    const variantImage = imageById.get(variant.imageId) || image || null;
    const colorName = colorOption ? selected.get(colorOption.name) : null;
    const weightName = weightOption ? selected.get(weightOption.name) : presentation.fixedWeight && presentation.fixedWeight.label;
    return {
      id: variant.id,
      variantId: numericId(variant.id),
      title: variant.title,
      selectedOptions: variant.selectedOptions.map((option) => ({ ...option })),
      colorKey: supportsQuickAdd ? normalizeKey(colorName) : null,
      colorName: supportsQuickAdd ? colorName : null,
      weightKey: supportsJigQuickAdd
        ? weightOption ? normalizeKey(weightName) : presentation.fixedWeight.key
        : null,
      weightLabel: supportsJigQuickAdd
        ? String(weightName || '').replace(/\s*oz\.?$/i, '')
        : null,
      price: Number(variant.price.amount),
      money: { ...variant.price },
      available: variant.availableForSale,
      image: variantImageUrl || (variantImage ? variantImage.image.url : null),
      imageAlt: variant && variant.image && variant.image.alt || (variantImage ? (variantImage.alt || product.title) : product.title)
    };
  });
  const defaultColorKey = supportsQuickAdd ? variantProjection[0].colorKey : null;
  const defaultWeightKey = supportsJigQuickAdd ? variantProjection[0].weightKey : null;
  const colors = supportsQuickAdd ? colorOption.values.map((value) => {
    const key = normalizeKey(value.name);
    const variant = variantProjection.find((candidate) => candidate.colorKey === key);
    return {
      key,
      name: value.name,
      swatch: COLOR_SWATCHES[key] || '#51433f',
      image: variant ? variant.image : (image ? image.image.url : null),
      imageAlt: variant ? variant.imageAlt : product.title,
      checkout: variant ? {
        id: variant.id,
        variantId: variant.variantId,
        title: variant.title
      } : null
    };
  }) : [];
  const weights = supportsJigQuickAdd
    ? weightOption
      ? weightOption.values.map((value) => ({
          key: normalizeKey(value.name),
          label: String(value.name || '').replace(/\s*oz\.?$/i, ''),
          priceDelta: 0
        }))
      : [{ ...presentation.fixedWeight, priceDelta: 0 }]
    : [];

  return {
    key: presentation.key || normalizeKey(product.handle),
    slug: presentation.key || normalizeKey(product.handle),
    handle: product.handle,
    pagePath: presentation.pagePath || 'products/' + product.handle,
    title: product.title,
    shortTitle: product.title,
    productType: product.productType || '',
    tags: Array.isArray(product.tags) ? product.tags.slice() : [],
    category: taxonomy.categoryForProduct(product),
    search: [
      product.title,
      product.vendor,
      product.productType,
      ...options.flatMap((option) =>
        [option.name, ...(Array.isArray(option.values) ? option.values.map((value) => value.name) : [])]
      )
    ].filter(Boolean).join(' '),
    optionNames: options.map((option) => option.name),
    basePrice: Number(defaultVariant.price.amount),
    baseMoney: { ...defaultVariant.price },
    featuredImage: image ? image.image.url : null,
    featuredImageAlt: image ? (image.alt || product.title) : product.title,
    defaultColorKey,
    defaultWeightKey,
    detailOnly: !supportsQuickAdd,
    rattle: { available: false, defaultKey: 'no', options: [
      { key: 'no', label: 'No', priceDelta: 0 }
    ] },
    weights,
    colors,
    description: textFromHtml(product.descriptionHtml),
    source: 'shopify',
    updatedAt: product.updatedAt,
    variants: variantProjection
  };
}

function logCatalogAdmissionIssues(envelope, logger) {
  if (!envelope || !Array.isArray(envelope.quarantine) || !envelope.quarantine.length) return;
  const issues = {};
  envelope.quarantine.forEach((issue) => {
    const handle = issue.handle || '_catalog';
    if (!issues[handle]) issues[handle] = new Set();
    issues[handle].add(issue.code);
  });
  Object.keys(issues).forEach((handle) => {
    issues[handle] = Array.from(issues[handle]).sort();
  });
  logger.warn('Shopify catalog admission issues', {
    generationId: envelope.generationId,
    generatedAt: envelope.generatedAt,
    acceptedCount: envelope.outcomes.accepted.length,
    quarantinedCount: new Set(envelope.outcomes.productQuarantined.map((issue) =>
      issue.productId || issue.handle || issue.code
    )).size,
    issues
  });
}

function admittedRemoteProduct(remoteProduct, normalizedProduct) {
  if (!remoteProduct || !normalizedProduct) return null;
  const admittedVariantIds = new Set(normalizedProduct.variants.map((variant) => variant.id));
  return {
    ...remoteProduct,
    variants: {
      ...remoteProduct.variants,
      nodes: remoteProduct.variants.nodes.filter((variant) => admittedVariantIds.has(variant.id))
    }
  };
}

function isAuthenticatedFieldPermissionFailure(error) {
  if (!error || error.statusCode !== 502) return false;
  const details = error && error.details;
  if (!Array.isArray(details) || details.length === 0) return false;
  const reducedFields = new Set(['tags', 'metafields', 'quantityAvailable']);
  return details.every((detail) => {
    const code = detail && detail.extensions && detail.extensions.code;
    const path = detail && detail.path;
    const field = Array.isArray(path) ? path[path.length - 1] : null;
    return code === 'ACCESS_DENIED' && reducedFields.has(field);
  });
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
    if (!isAuthenticatedFieldPermissionFailure(error)) throw error;
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
    if (remoteProducts.length) {
      const classificationFailure = new Error(
        'Shopify reduced catalog query cannot prove product classification.'
      );
      classificationFailure.code = 'shopify_catalog_classification_unavailable';
      throw classificationFailure;
    }
  }

  const generatedAt = options.generatedAt || new Date().toISOString();
  const envelope = normalizeCatalogEnvelope(remoteProducts, {
    generatedAt,
    generationId: options.generationId || randomUUID(),
    requestId: options.requestId || randomUUID(),
    ttlSeconds: CACHE_TTL_MS / 1000
  });
  logCatalogAdmissionIssues(envelope, options.logger || console);
  const remoteByHandle = new Map(remoteProducts.map((product) => [product.handle, product]));
  const admittedRemoteByHandle = new Map(envelope.products.map((product) => [
    product.handle,
    admittedRemoteProduct(remoteByHandle.get(product.handle), product)
  ]));
  const products = envelope.products
    .filter((product) =>
      (!product.presentation || product.presentation.kind === 'ordinary')
    )
    .map((product) => normalizeDiscoveredProduct(product))
    .filter(Boolean);
  const rattleProduct = Array.from(admittedRemoteByHandle.values()).find((product) =>
    product &&
    (product.handle === 'rattle-add-on' || normalizeKey(product.productType) === 'rattle-add-on')
  );
  const rattle = normalizeRattle(rattleProduct);

  if (!rattle) {
    errors.push({
      code: 'missing_rattle_add_on',
      product: 'rattle-add-on',
      message: 'Published Shopify Rattle Add-on product not found.'
    });
  }

  const drops = Array.from(admittedRemoteByHandle.values())
    .filter((product) => product && isLimitedDrop(product))
    .map((product) => normalizeDrop(product, rattle, errors, Date.now()))
    .filter(Boolean)
    .sort((left, right) => Date.parse(right.drop.startsAt || 0) - Date.parse(left.drop.startsAt || 0));
  const currentDrop = drops[0] || null;

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

function createCatalogRuntime(options = {}) {
  const environment = options.environment || process.env;
  const useLocalMemoryStore =
    environment.VERCEL_ENV === 'development' &&
    environment.CATALOG_LOCAL_MEMORY_STORE === 'true';
  return createCatalogService({
    ...options,
    namespace: deriveCatalogNamespace(environment, options.namespace),
    store: options.store || (
      useLocalMemoryStore
        ? createMemoryCatalogStore()
        : createCatalogStoreFromEnv(environment)
    ),
    loadCatalog: options.loadCatalog || loadFreshCatalog
  });
}

function catalogRuntime() {
  if (!defaultCatalogService) defaultCatalogService = createCatalogRuntime();
  return defaultCatalogService;
}

async function getCatalog(request) {
  return catalogRuntime().getCatalog(request);
}

async function getCatalogHealthState() {
  return catalogRuntime().getHealthState();
}

async function acceptCatalogInvalidation(event) {
  return catalogRuntime().acceptInvalidation(event);
}

async function runScheduledCatalogRefresh(request, scheduleToken) {
  return catalogRuntime().runScheduledRefresh(request, scheduleToken);
}

async function reconcileCatalog(request) {
  return catalogRuntime().reconcile(request);
}

function clearCatalogCache() {
  defaultCatalogService = null;
}

module.exports = {
  CatalogNamespaceConfigurationError,
  acceptCatalogInvalidation,
  clearCatalogCache,
  createCatalogRuntime,
  deriveCatalogNamespace,
  getCatalog,
  getCatalogHealthState,
  loadFreshCatalog,
  loadShopifyProducts,
  normalizeDiscoveredProduct,
  reconcileCatalog,
  runScheduledCatalogRefresh
};
