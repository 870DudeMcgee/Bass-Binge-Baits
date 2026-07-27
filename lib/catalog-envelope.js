'use strict';

const SCHEMA_VERSION = 2;
const DEFAULT_TTL_SECONDS = 45;

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isDefaultOption(option) {
  if (!option) return false;
  const values = Array.isArray(option.optionValues) ? option.optionValues : [];
  return normalizeKey(option.name) === 'title' &&
    values.length === 1 &&
    normalizeKey(values[0] && values[0].name) === 'default-title';
}

function normalizeOptions(product) {
  const options = Array.isArray(product.options) ? product.options : [];
  const meaningful = options.length === 1 && isDefaultOption(options[0]) ? [] : options;

  return meaningful.map((option) => ({
    id: option.id || null,
    name: String(option.name || ''),
    values: (Array.isArray(option.optionValues) ? option.optionValues : []).map((value) => ({
      id: value && value.id ? value.id : null,
      name: String(value && value.name || '')
    }))
  }));
}

function normalizeMoney(money) {
  if (!money || money.amount === null || money.amount === undefined) return null;
  const amount = String(money.amount);
  const currencyCode = String(money.currencyCode || '');
  if (!/^-?\d+(?:\.\d+)?$/.test(amount) || Number(amount) < 0 || !/^[A-Z]{3}$/.test(currencyCode)) {
    return null;
  }
  return { amount, currencyCode };
}

function normalizeMedia(media) {
  const base = {
    id: media && media.id ? media.id : null,
    type: normalizeKey(media && media.__typename) || 'unknown',
    alt: media && (media.alt || (media.image && media.image.altText)) || null
  };

  if (media && media.__typename === 'MediaImage' && media.image && media.image.url) {
    return {
      ...base,
      type: 'image',
      image: {
        id: media.image.id || null,
        url: media.image.url,
        width: media.image.width ?? null,
        height: media.image.height ?? null
      }
    };
  }
  if (media && media.__typename === 'Video') {
    return {
      ...base,
      type: 'video',
      sources: Array.isArray(media.sources) ? media.sources.map((source) => ({ ...source })) : []
    };
  }
  if (media && media.__typename === 'ExternalVideo') {
    return {
      ...base,
      type: 'external-video',
      host: media.host || null,
      embedUrl: media.embedUrl || null,
      originUrl: media.originUrl || null
    };
  }
  if (media && media.__typename === 'Model3d') {
    return {
      ...base,
      type: 'model-3d',
      sources: Array.isArray(media.sources) ? media.sources.map((source) => ({ ...source })) : []
    };
  }
  return base;
}

function metafieldMap(product) {
  return (Array.isArray(product.metafields) ? product.metafields : [])
    .filter(Boolean)
    .reduce((result, field) => {
      result[field.key] = field.value;
      return result;
    }, {});
}

function classifyProduct(product) {
  const tags = (Array.isArray(product.tags) ? product.tags : []).map(normalizeKey);
  const productType = normalizeKey(product.productType);
  if (productType === 'rattle-add-on' || tags.includes('rattle-add-on')) return 'hidden-add-on';
  if (productType === 'limited-drop' || tags.includes('limited-drop')) return 'limited-drop';
  return 'ordinary';
}

function presentationFor(product) {
  const fields = metafieldMap(product);
  const kind = classifyProduct(product);
  const establishedHeartlander =
    kind === 'limited-drop' &&
    normalizeKey(product.handle) === 'limited-drop' &&
    /heartlander/i.test(product.title || '');
  return {
    kind,
    shortDescription: fields.short_description || null,
    badgeText: fields.badge_text || null,
    dropStartsAt: fields.drop_starts_at || (
      establishedHeartlander ? product.publishedAt || null : null
    ),
    dropEndsAt: fields.drop_ends_at || null,
    optionRoles: fields.option_roles || null,
    swatches: fields.swatches || null,
    rattleEnabled: (Array.isArray(product.tags) ? product.tags : []).map(normalizeKey).includes('rattle-enabled')
  };
}

function issueFor(product, generatedAt, issue) {
  return {
    productId: product && product.id || null,
    handle: product && product.handle || null,
    severity: issue.severity,
    code: issue.code,
    field: issue.field || null,
    message: issue.message,
    remedy: issue.remedy || null,
    variantId: issue.variantId || null,
    observedAt: generatedAt
  };
}

function tupleKey(selectedOptions, optionNames) {
  const byName = new Map(selectedOptions.map((option) => [option.name, option.value]));
  return optionNames.map((name) => `${name}\u0000${byName.get(name)}`).join('\u0001');
}

function normalizeProduct(product, generatedAt) {
  const quarantine = [];
  const options = normalizeOptions(product);
  const optionNames = options.map((option) => option.name);
  const rawVariants = product && product.variants && Array.isArray(product.variants.nodes)
    ? product.variants.nodes
    : [];
  const variants = [];
  const seenTuples = new Set();
  let productBlocked = false;

  if (!product || !product.id || !product.handle || !product.title) {
    quarantine.push(issueFor(product, generatedAt, {
      severity: 'product-quarantined',
      code: 'product_identity_invalid',
      field: 'id/handle/title',
      message: 'The Shopify product is missing an ID, handle, or title.',
      remedy: 'Set a product title and valid handle, then republish it.'
    }));
    productBlocked = true;
  }

  if (!rawVariants.length) {
    quarantine.push(issueFor(product, generatedAt, {
      severity: 'product-quarantined',
      code: 'product_has_no_variants',
      field: 'variants',
      message: `${product && product.title || 'Product'} has no Shopify variants.`,
      remedy: 'Add at least one priced Shopify variant.'
    }));
    productBlocked = true;
  }

  rawVariants.forEach((variant) => {
    const selectedOptions = optionNames.length
      ? (Array.isArray(variant.selectedOptions) ? variant.selectedOptions : []).map((option) => ({
          name: String(option && option.name || ''),
          value: String(option && option.value || '')
        }))
      : [];
    const selectedByName = new Map(selectedOptions.map((option) => [option.name, option.value]));
    const selectionComplete = optionNames.every((name) => selectedByName.has(name) && selectedByName.get(name));
    const selectionExact = selectedOptions.length === optionNames.length;

    if (!selectionComplete || !selectionExact) {
      quarantine.push(issueFor(product, generatedAt, {
        severity: 'product-quarantined',
        code: 'variant_option_tuple_incomplete',
        field: 'variants.selectedOptions',
        variantId: variant && variant.id || null,
        message: `${product.title} has a variant with an incomplete selected-option tuple.`,
        remedy: 'Set one value for every Shopify option on every variant.'
      }));
      productBlocked = true;
      return;
    }

    const price = normalizeMoney(variant.price);
    if (!variant.id || !price) {
      quarantine.push(issueFor(product, generatedAt, {
        severity: 'variant-blocked',
        code: !variant.id ? 'variant_id_invalid' : 'variant_money_invalid',
        field: !variant.id ? 'variants.id' : 'variants.price',
        variantId: variant && variant.id || null,
        message: !variant.id
          ? `${product.title} has a variant without a Shopify ID.`
          : `${product.title} has a variant without valid price and currency data.`,
        remedy: !variant.id
          ? 'Recreate or repair the Shopify variant.'
          : 'Set a non-negative variant price with a valid currency.'
      }));
      return;
    }

    const key = tupleKey(selectedOptions, optionNames);
    if (seenTuples.has(key)) {
      quarantine.push(issueFor(product, generatedAt, {
        severity: 'product-quarantined',
        code: 'variant_option_tuple_duplicate',
        field: 'variants.selectedOptions',
        variantId: variant.id,
        message: `${product.title} has duplicate variants for the same option selection.`,
        remedy: 'Keep exactly one Shopify variant for each option combination.'
      }));
      productBlocked = true;
      return;
    }
    seenTuples.add(key);

    variants.push({
      id: variant.id,
      title: variant.title || '',
      selectedOptions,
      price,
      compareAtPrice: normalizeMoney(variant.compareAtPrice),
      availableForSale: Boolean(variant.availableForSale),
      quantityAvailable: Number.isFinite(variant.quantityAvailable) ? variant.quantityAvailable : null,
      imageId: variant.image && variant.image.id || null,
      image: variant.image && variant.image.url ? {
        id: variant.image.id || null,
        url: variant.image.url,
        alt: variant.image.altText || null,
        width: variant.image.width ?? null,
        height: variant.image.height ?? null
      } : null
    });
  });

  if (!variants.length && rawVariants.length) {
    quarantine.push(issueFor(product, generatedAt, {
      severity: 'product-quarantined',
      code: 'product_has_no_valid_variants',
      field: 'variants',
      message: `${product.title} has no valid Shopify variants.`,
      remedy: 'Repair at least one blocked variant and its price.'
    }));
    productBlocked = true;
  }

  const presentation = presentationFor(product);
  const media = product && product.media && Array.isArray(product.media.nodes)
    ? product.media.nodes.map(normalizeMedia)
    : [];
  if (
    presentation.kind !== 'hidden-add-on' &&
    !media.some((item) => item.type === 'image' && item.image && item.image.url)
  ) {
    quarantine.push(issueFor(product, generatedAt, {
      severity: 'warning',
      code: 'product_image_missing',
      field: 'media',
      message: `${product.title} has no usable product image.`,
      remedy: 'Upload at least one product image for the gallery.'
    }));
  }
  media.forEach((item) => {
    if (!item.alt) {
      quarantine.push(issueFor(product, generatedAt, {
        severity: 'warning',
        code: 'media_alt_missing',
        field: `media.${item.id || 'unknown'}.alt`,
        message: `${product.title} has product media without alt text.`,
        remedy: 'Add concise alt text in Shopify.'
      }));
    }
    if (!['image', 'video', 'external-video', 'model-3d'].includes(item.type)) {
      quarantine.push(issueFor(product, generatedAt, {
        severity: 'warning',
        code: 'media_type_unsupported',
        field: `media.${item.id || 'unknown'}.type`,
        message: `${product.title} includes unsupported media type ${item.type}.`,
        remedy: 'Add a product image fallback for this media item.'
      }));
    }
  });

  if (options.some((option) => normalizeKey(option.name) === 'color') && !presentation.swatches) {
    quarantine.push(issueFor(product, generatedAt, {
      severity: 'warning',
      code: 'swatches_missing',
      field: 'presentation.swatches',
      message: `${product.title} has a Color option without validated swatch metadata.`,
      remedy: 'Add an optional bass_binge.swatches metafield or use the text selector fallback.'
    }));
  }
  if (presentation.kind === 'limited-drop') {
    const start = Date.parse(presentation.dropStartsAt || '');
    const end = Date.parse(presentation.dropEndsAt || '');
    const establishedOpenEndedHeartlander =
      normalizeKey(product.handle) === 'limited-drop' &&
      /heartlander/i.test(product.title || '') &&
      Number.isFinite(start) &&
      !presentation.dropEndsAt;
    if (
      !establishedOpenEndedHeartlander &&
      (!Number.isFinite(start) || !Number.isFinite(end) || start >= end)
    ) {
      quarantine.push(issueFor(product, generatedAt, {
        severity: 'product-quarantined',
        code: 'limited_drop_timing_invalid',
        field: 'presentation.dropStartsAt/dropEndsAt',
        message: `${product.title} is classified as a limited drop but has no valid start/end window.`,
        remedy: 'Set valid bass_binge.drop_starts_at and bass_binge.drop_ends_at metafields.'
      }));
      productBlocked = true;
    }
  }

  const normalized = {
    id: product.id,
    handle: product.handle,
    title: product.title,
    descriptionHtml: product.descriptionHtml || '',
    vendor: product.vendor || '',
    productType: product.productType || '',
    tags: Array.isArray(product.tags) ? product.tags.slice() : [],
    publishedAt: product.publishedAt || null,
    updatedAt: product.updatedAt || null,
    availableForSale: Boolean(product.availableForSale) && variants.some((variant) => variant.availableForSale),
    featuredMediaId:
      product.featuredImage && product.featuredImage.id ||
      product.featuredMedia && product.featuredMedia.id ||
      null,
    media,
    options,
    variants,
    presentation
  };

  return { normalized, quarantine, productBlocked };
}

function normalizeCatalogEnvelope(remoteProducts, options = {}) {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const sourceProducts = Array.isArray(remoteProducts) ? remoteProducts : [];
  const products = [];
  const quarantine = [];
  const outcomes = {
    accepted: [],
    warning: [],
    variantBlocked: [],
    productQuarantined: []
  };

  sourceProducts.forEach((product) => {
    const result = normalizeProduct(product, generatedAt);
    quarantine.push(...result.quarantine);
    result.quarantine.forEach((issue) => {
      if (issue.severity === 'warning') outcomes.warning.push(issue);
      if (issue.severity === 'variant-blocked') outcomes.variantBlocked.push(issue);
      if (issue.severity === 'product-quarantined') outcomes.productQuarantined.push(issue);
    });
    if (!result.productBlocked) {
      products.push(result.normalized);
      outcomes.accepted.push({
        status: 'accepted',
        productId: result.normalized.id,
        handle: result.normalized.handle,
        observedAt: generatedAt
      });
    }
  });

  const updatedTimes = sourceProducts
    .map((product) => Date.parse(product && product.updatedAt || ''))
    .filter(Number.isFinite);
  const sourceUpdatedAt = updatedTimes.length
    ? new Date(Math.max(...updatedTimes)).toISOString()
    : null;

  return {
    schemaVersion: SCHEMA_VERSION,
    generationId: options.generationId || null,
    generatedAt,
    sourceUpdatedAt,
    freshness: {
      status: 'fresh',
      ageSeconds: 0,
      ttlSeconds: options.ttlSeconds || DEFAULT_TTL_SECONDS
    },
    stale: false,
    requestId: options.requestId || null,
    products,
    quarantine,
    outcomes
  };
}

module.exports = {
  SCHEMA_VERSION,
  normalizeCatalogEnvelope
};
