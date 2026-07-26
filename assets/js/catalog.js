(function (root) {
  'use strict';

  var STORE = {
    domain: 'bassbingebaits.myshopify.com',
    apiVersion: '2026-01',
    storefrontAccessToken: '',
    cartStorageKey: 'bass-binge-cart-v2',
    shopifyCartStorageKey: 'bass-binge-shopify-cart-v1',
    legacyCartStorageKeys: ['bassbinge-cart', 'bass-binge-cart-v1']
  };
  var NO_RATTLE_OPTIONS = [{ key: 'no', label: 'No', priceDelta: 0 }];
  var PRODUCTS = [];
  var RATTLE_ADD_ON = null;
  var CATALOG_STATUS = {
    source: 'unavailable',
    fetchedAt: null,
    generationId: null,
    stale: false,
    errors: []
  };

  function normalizeKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function listProducts() {
    return PRODUCTS.slice();
  }

  function getProduct(key) {
    var normalized = normalizeKey(key);
    return PRODUCTS.find(function (product) {
      return product &&
        (product.key === key ||
          product.slug === key ||
          product.handle === key ||
          product.key === normalized ||
          product.slug === normalized ||
          product.handle === normalized);
    }) || null;
  }

  function getColor(product, colorKey) {
    if (!product || !Array.isArray(product.colors)) return null;
    var normalized = normalizeKey(colorKey);
    return product.colors.find(function (color) {
      return color.key === colorKey || color.key === normalized;
    }) || null;
  }

  function getColorByName(product, colorName) {
    if (!product || !Array.isArray(product.colors)) return null;
    var normalized = normalizeKey(colorName);
    return product.colors.find(function (color) {
      return color.key === normalized || normalizeKey(color.name) === normalized;
    }) || null;
  }

  function getWeight(product, weightKey) {
    if (!product || !Array.isArray(product.weights)) return null;
    var normalized = normalizeKey(weightKey);
    return product.weights.find(function (weight) {
      return weight.key === weightKey ||
        weight.key === normalized ||
        normalizeKey(weight.label) === normalized ||
        normalizeKey(weight.label + ' oz') === normalized;
    }) || null;
  }

  function getRattleOptions(product) {
    if (!product || !product.rattle || !product.rattle.available) {
      return NO_RATTLE_OPTIONS;
    }
    return Array.isArray(product.rattle.options) && product.rattle.options.length
      ? product.rattle.options
      : NO_RATTLE_OPTIONS;
  }

  function getRattleOption(product, rattleKey) {
    var defaultKey = product && product.rattle ? product.rattle.defaultKey : 'no';
    var key = normalizeKey(rattleKey || defaultKey || 'no');
    var options = getRattleOptions(product);
    return options.find(function (option) {
      return option.key === key;
    }) || options[0];
  }

  function getCheckoutMapping(product, color, weight, rattle) {
    if (!product || !color || !weight || !rattle || product.commerceDisabled) {
      return null;
    }
    var variants = Array.isArray(product.variants) ? product.variants : [];
    var variant = variants.find(function (candidate) {
      return candidate.colorKey === color.key && candidate.weightKey === weight.key;
    });
    if (!variant || !variant.available) return null;
    if (rattle.key === 'yes' && (!RATTLE_ADD_ON || !RATTLE_ADD_ON.available)) {
      return null;
    }
    return {
      id: variant.id,
      merchandiseId: variant.id,
      variantId: variant.variantId,
      title: variant.title,
      price: variant.price,
      available: variant.available
    };
  }

  function getJigBuild(selection) {
    var product = getProduct(selection && selection.productKey);
    if (!product || product.detailOnly) return null;
    var colors = Array.isArray(product.colors) ? product.colors : [];
    var weights = Array.isArray(product.weights) ? product.weights : [];
    var color = getColor(product, selection.colorKey) ||
      getColor(product, product.defaultColorKey) ||
      colors[0];
    var weight = getWeight(product, selection.weightKey) ||
      getWeight(product, product.defaultWeightKey) ||
      weights[0];
    var rattle = getRattleOption(product, selection.rattleKey);
    if (!color || !weight || !rattle) return null;
    var checkoutMapping = getCheckoutMapping(product, color, weight, rattle);
    var jigPrice = checkoutMapping && Number.isFinite(Number(checkoutMapping.price))
      ? Number(checkoutMapping.price)
      : null;
    if (jigPrice === null) return null;
    var rattlePrice = rattle.key === 'yes' && RATTLE_ADD_ON
      ? Number(RATTLE_ADD_ON.price || 0)
      : 0;
    return {
      id: [product.key, color.key, weight.key, rattle.key].join(':'),
      productKey: product.key,
      productTitle: product.title,
      colorKey: color.key,
      colorName: color.name,
      weightKey: weight.key,
      weightLabel: weight.label,
      rattleKey: rattle.key,
      rattleLabel: rattle.label,
      hasRattle: rattle.key === 'yes',
      price: jigPrice + rattlePrice,
      image: color.image,
      checkoutMapping: checkoutMapping,
      rattleMapping: rattle.key === 'yes' ? RATTLE_ADD_ON : null,
      isCheckoutable: Boolean(
        checkoutMapping &&
        (checkoutMapping.merchandiseId || checkoutMapping.variantId) &&
        (rattle.key !== 'yes' || (RATTLE_ADD_ON && RATTLE_ADD_ON.available))
      )
    };
  }

  function isBuildCheckoutable(selection) {
    var build = getJigBuild(selection);
    return Boolean(build && build.isCheckoutable);
  }

  function firstCheckoutableColor(product, weightKey, rattleKey) {
    if (!product || !Array.isArray(product.colors)) return null;
    return product.colors.find(function (color) {
      return isBuildCheckoutable({
        productKey: product.key,
        colorKey: color.key,
        weightKey: weightKey || product.defaultWeightKey,
        rattleKey: rattleKey || (product.rattle && product.rattle.defaultKey) || 'no'
      });
    }) || null;
  }

  function findProductByVariantId(variantId) {
    var id = String(variantId);
    var match = null;
    PRODUCTS.some(function (product) {
      var variant = (Array.isArray(product.variants) ? product.variants : []).find(function (candidate) {
        return String(candidate.variantId) === id || String(candidate.id) === id;
      });
      if (!variant) return false;
      match = {
        product: product,
        color: getColor(product, variant.colorKey),
        weight: getWeight(product, variant.weightKey),
        variant: variant
      };
      return true;
    });
    return match;
  }

  function getSearchText(product) {
    if (!product) return '';
    return [
      product.title,
      product.shortTitle,
      product.search,
      (product.weights || []).map(function (weight) { return weight.label; }).join(' '),
      (product.colors || []).map(function (color) { return color.name; }).join(' ')
    ].join(' ').toLowerCase();
  }

  function assetPath(path) {
    if (!path || /^(https?:)?\/\//.test(path) || path.charAt(0) === '/' || path.indexOf('../') === 0) {
      return path;
    }
    var locationPath = root.location && root.location.pathname ? root.location.pathname : '';
    return /\/products\//.test(locationPath) ? '../' + path : path;
  }

  function formatMoney(value) {
    return '$' + Number(value || 0).toFixed(2);
  }

  function getCurrentDrop() {
    return PRODUCTS.find(function (product) {
      return product.isLimitedDrop;
    }) || null;
  }

  function updatePublicState() {
    api.products = PRODUCTS;
    api.rattleAddOn = RATTLE_ADD_ON;
    api.status = CATALOG_STATUS;
  }

  function markUnavailable(error) {
    PRODUCTS = [];
    RATTLE_ADD_ON = null;
    CATALOG_STATUS = {
      source: 'unavailable',
      fetchedAt: null,
      generationId: null,
      stale: false,
      errors: error ? [{
        code: 'shopify_catalog_unavailable',
        message: error.message || String(error)
      }] : []
    };
    updatePublicState();
    return false;
  }

  function applyRemoteCatalog(payload) {
    var projection = payload && payload.legacy;
    if (
      !payload ||
      payload.schemaVersion !== 2 ||
      !payload.generationId ||
      !Array.isArray(payload.products) ||
      !projection ||
      !projection.ok ||
      !Array.isArray(projection.products)
    ) {
      return markUnavailable(new Error('Catalog response was not a validated envelope.'));
    }

    var admittedHandles = new Set(payload.products.filter(function (product) {
      return product &&
        product.handle &&
        (!product.presentation || product.presentation.kind !== 'hidden-add-on');
    }).map(function (product) {
      return product.handle;
    }));

    PRODUCTS = projection.products.filter(function (product) {
      return product &&
        product.handle &&
        product.pagePath &&
        admittedHandles.has(product.handle);
    });
    if (
      projection.currentDrop &&
      projection.currentDrop.handle &&
      admittedHandles.has(projection.currentDrop.handle) &&
      !PRODUCTS.some(function (product) { return product.handle === projection.currentDrop.handle; })
    ) {
      PRODUCTS.unshift(projection.currentDrop);
    }
    RATTLE_ADD_ON = projection.rattle || null;
    PRODUCTS.forEach(function (product) {
      if (!product.rattle || !product.rattle.available || !RATTLE_ADD_ON) return;
      product.rattle.options = [
        { key: 'no', label: 'No', priceDelta: 0 },
        { key: 'yes', label: 'Yes', priceDelta: Number(RATTLE_ADD_ON.price || 0) }
      ];
    });
    CATALOG_STATUS = {
      source: projection.source || payload.source || 'shopify',
      fetchedAt: projection.fetchedAt || payload.generatedAt || null,
      generationId: payload.generationId,
      stale: Boolean(payload.stale),
      errors: []
    };
    updatePublicState();
    return true;
  }

  function loadLiveCatalog() {
    if (!root.document || typeof root.fetch !== 'function') {
      return Promise.resolve(api);
    }
    return root.fetch('/api/catalog', { headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) throw new Error('Catalog adapter returned ' + response.status);
        return response.json();
      })
      .then(function (payload) {
        if (!applyRemoteCatalog(payload)) {
          throw new Error('Catalog adapter returned an invalid envelope.');
        }
        return api;
      })
      .catch(function (error) {
        markUnavailable(error);
        return api;
      });
  }

  var api = {
    store: STORE,
    products: PRODUCTS,
    listProducts: listProducts,
    getProduct: getProduct,
    getColor: getColor,
    getColorByName: getColorByName,
    getWeight: getWeight,
    getRattleOptions: getRattleOptions,
    getRattleOption: getRattleOption,
    getCheckoutMapping: getCheckoutMapping,
    isBuildCheckoutable: isBuildCheckoutable,
    firstCheckoutableColor: firstCheckoutableColor,
    getJigBuild: getJigBuild,
    findProductByVariantId: findProductByVariantId,
    getSearchText: getSearchText,
    getCurrentDrop: getCurrentDrop,
    applyRemoteCatalog: applyRemoteCatalog,
    markUnavailable: markUnavailable,
    assetPath: assetPath,
    formatMoney: formatMoney,
    normalizeKey: normalizeKey,
    rattleAddOn: RATTLE_ADD_ON,
    status: CATALOG_STATUS
  };

  root.BassBingeCatalog = api;
  api.ready = loadLiveCatalog();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
