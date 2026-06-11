(function (root) {
  'use strict';

  var STORE = {
    domain: 'bassbingebaits.myshopify.com',
    apiVersion: '2026-01',
    storefrontAccessToken: '',
    cartStorageKey: 'bass-binge-cart-v2',
    legacyCartStorageKeys: ['bassbinge-cart', 'bass-binge-cart-v1']
  };

  var RATTLE_OPTIONS = [
    { key: 'no', label: 'No', priceDelta: 0 },
    { key: 'yes', label: 'Yes', priceDelta: 0.5 }
  ];

  var NO_RATTLE_OPTIONS = [
    { key: 'no', label: 'No', priceDelta: 0 }
  ];

  var PRODUCTS = [
    {
      key: 'peewee-spider-hd',
      legacyProductId: 'peewee-spider-hd',
      legacyShopifyKey: 'peewee-spider-hd-5-16',
      slug: 'peewee-spider-hd',
      handle: '5-16-peewee-spider-hd-finesse-cut',
      pagePath: 'products/peewee-spider-hd.html',
      title: '5/16 PeeWee Spider HD',
      shortTitle: 'PeeWee Spider HD',
      search: '5/16 peewee spider hd finesse cut blackberry smoothie magic brownie fine ryry special fine biggie smalls a little lit ogre',
      basePrice: 5,
      featuredImage: 'assets/img/products/pro-spider-5-16.jpg',
      defaultColorKey: 'magic-brownie-fine',
      defaultWeightKey: '5-16',
      rattle: {
        available: false,
        defaultKey: 'no',
        options: NO_RATTLE_OPTIONS
      },
      weights: [
        { key: '5-16', label: '5/16', priceDelta: 0 }
      ],
      colors: [
        {
          key: 'blackberry-smoothie',
          name: 'Blackberry Smoothie',
          swatch: '#2d1631',
          image: 'assets/img/products/pshd-blackberry-smoothie.jpg',
          checkout: { variantId: 50253364265127, title: 'Blackberry Smoothie' }
        },
        {
          key: 'magic-brownie-fine',
          name: 'Magic Brownie Fine',
          swatch: '#5b3f2f',
          image: 'assets/img/products/pshd-magic-brownie.jpg',
          checkout: { variantId: 50253364297895, title: 'Magic Brownie' }
        },
        {
          key: 'ryry-special-fine',
          name: 'RyRy Special Fine',
          swatch: '#6a4e43',
          image: 'assets/img/products/pshd-ryry-special.jpg',
          checkout: { variantId: 50253364330663, title: 'RyRy Special' }
        },
        {
          key: 'biggie-smalls',
          name: 'Biggie Smalls',
          swatch: '#2f2b25',
          image: 'assets/img/products/pshd-biggie-smalls.jpg',
          checkout: { variantId: 50253364363431, title: 'Biggie Smalls' }
        },
        {
          key: 'a-little-lit',
          name: 'A Little Lit',
          swatch: '#79513a',
          image: 'assets/img/products/pshd-a-little-lit.jpg',
          checkout: { variantId: 50253364396199, title: 'A Little Lit' }
        },
        {
          key: 'ogre',
          name: 'Ogre',
          swatch: '#505237',
          image: 'assets/img/products/pshd-ogre.jpg',
          checkout: { variantId: 50253364428967, title: 'Ogre' }
        }
      ]
    },
    {
      key: 'peewee-football-hd',
      legacyProductId: 'peewee-football-hd',
      legacyShopifyKey: 'peewee-football-hd-1-2',
      slug: 'peewee-football-hd',
      handle: 'premium-football-jig',
      pagePath: 'products/peewee-football-hd.html',
      title: '1/2 PeeWee Football HD',
      shortTitle: 'PeeWee Football HD',
      search: '1/2 peewee football hd magic brownie fine bad bo craw essence lit pbj lite smokin pb',
      basePrice: 5,
      featuredImage: 'assets/img/products/peewee-football-hd-1-2.jpg',
      defaultColorKey: 'magic-brownie-fine',
      defaultWeightKey: '1-2',
      rattle: {
        available: false,
        defaultKey: 'no',
        options: NO_RATTLE_OPTIONS
      },
      weights: [
        { key: '1-2', label: '1/2', priceDelta: 0 }
      ],
      colors: [
        {
          key: 'magic-brownie-fine',
          name: 'Magic Brownie Fine',
          swatch: '#5b3f2f',
          image: 'assets/img/products/pwf-hd-12-magic-brownie.jpg',
          checkout: null
        },
        {
          key: 'bad-bo',
          name: 'Bad B.O.',
          swatch: '#22352a',
          image: 'assets/img/products/pwf-hd-12-bad-bo.jpg',
          checkout: { variantId: 50149134336167, title: 'BAD B.O.' }
        },
        {
          key: 'craw-essence',
          name: 'Craw Essence',
          swatch: '#8a4830',
          image: 'assets/img/products/pwf-hd-12-craw-essence.jpg',
          checkout: { variantId: 50121430335655, title: 'Craw Essence' }
        },
        {
          key: 'lit',
          name: 'Lit',
          swatch: '#a75c32',
          image: 'assets/img/products/pwf-hd-12-lit.jpg',
          checkout: { variantId: 50149443502247, title: 'Lit' }
        },
        {
          key: 'pbj-lite',
          name: 'PBJ Lite',
          swatch: '#5d4a67',
          image: 'assets/img/products/pwf-hd-12-pbj-lite.jpg',
          checkout: { variantId: 50149978341543, title: 'PBJ Lite' }
        },
        {
          key: 'smokin-pb',
          name: 'Smokin PB',
          swatch: '#4d4138',
          image: 'assets/img/products/pwf-hd-12-smokin-pb.jpg',
          checkout: { variantId: 50150079266983, title: 'Smokin PB' }
        }
      ]
    },
    {
      key: 'heavy-cover-football',
      legacyProductId: 'heavy-cover-football',
      legacyShopifyKey: 'heavy-cover-football-3-4',
      slug: 'heavy-cover-football',
      handle: '3-4-oz-football-jig',
      pagePath: 'products/heavy-cover-football.html',
      title: '3/4 Heavy Cover Football',
      shortTitle: 'Heavy Cover Football',
      search: '3/4 heavy cover football magic brownie bad bo craw essence lit pbj lite smokin pb',
      basePrice: 5,
      featuredImage: 'assets/img/products/heavy-cover-football-3-4.jpg',
      defaultColorKey: 'magic-brownie',
      defaultWeightKey: '3-4',
      rattle: {
        available: true,
        defaultKey: 'no',
        options: RATTLE_OPTIONS
      },
      weights: [
        { key: '3-4', label: '3/4', priceDelta: 0 }
      ],
      colors: [
        {
          key: 'magic-brownie',
          name: 'Magic Brownie',
          swatch: '#5b3f2f',
          image: 'assets/img/products/hcf-34-magic-brownie.jpg',
          checkout: null
        },
        {
          key: 'bad-bo',
          name: 'Bad B.O.',
          swatch: '#22352a',
          image: 'assets/img/products/hcf-34-bad-bo.jpg',
          checkout: { variantId: 50212502536359, title: 'BAD B.O.' }
        },
        {
          key: 'craw-essence',
          name: 'Craw Essence',
          swatch: '#8a4830',
          image: 'assets/img/products/hcf-34-craw-essence.jpg',
          checkout: { variantId: 50212502503591, title: 'Craw Essence' }
        },
        {
          key: 'lit',
          name: 'Lit',
          swatch: '#a75c32',
          image: 'assets/img/products/hcf-34-lit.jpg',
          checkout: { variantId: 50212502569127, title: 'Lit' }
        },
        {
          key: 'pbj-lite',
          name: 'PBJ Lite',
          swatch: '#5d4a67',
          image: 'assets/img/products/hcf-34-pbj-lite.jpg',
          checkout: { variantId: 50212502601895, title: 'PBJ Lite' }
        },
        {
          key: 'smokin-pb',
          name: 'Smokin PB',
          swatch: '#4d4138',
          image: 'assets/img/products/hcf-34-smokin-pb.jpg',
          checkout: { variantId: 50212502634663, title: 'Smokin PB' }
        }
      ]
    },
    {
      key: 'peewee-football',
      legacyProductId: 'peewee-football',
      legacyShopifyKey: 'peewee-football-7-16',
      slug: 'peewee-football',
      handle: '7-16-oz-peewee-football-jig',
      pagePath: 'products/peewee-football.html',
      title: '7/16 oz PeeWee Football Jig',
      shortTitle: 'PeeWee Football',
      search: '7/16 peewee football blackberry smoothie magic brownie fine ryry special fine biggie smalls a little lit ogre 5/16 3/16',
      basePrice: 5,
      featuredImage: 'assets/img/products/peewee-football-7-16.jpg',
      defaultColorKey: 'blackberry-smoothie',
      defaultWeightKey: '7-16',
      rattle: {
        available: true,
        defaultKey: 'no',
        options: RATTLE_OPTIONS
      },
      weights: [
        { key: '7-16', label: '7/16', priceDelta: 0 },
        { key: '5-16', label: '5/16', priceDelta: 0 },
        { key: '3-16', label: '3/16', priceDelta: 0 }
      ],
      colors: [
        {
          key: 'magic-brownie-fine',
          name: 'Magic Brownie Fine',
          swatch: '#5b3f2f',
          image: 'assets/img/products/pwf-716-magic-brownie.jpg',
          checkout: { variantId: 50250725687463, title: 'Magic Brownie' }
        },
        {
          key: 'blackberry-smoothie',
          name: 'Blackberry Smoothie',
          swatch: '#2d1631',
          image: 'assets/img/products/pwf-716-blackberry-smoothie.jpg',
          checkout: { variantId: 50250391388327, title: 'Blackberry Smoothie' }
        },
        {
          key: 'ryry-special-fine',
          name: 'RyRy Special Fine',
          swatch: '#6a4e43',
          image: 'assets/img/products/pwf-716-ryry-special.jpg',
          checkout: { variantId: 50250725720231, title: 'RyRy Special' }
        },
        {
          key: 'a-little-lit',
          name: 'A Little Lit',
          swatch: '#79513a',
          image: 'assets/img/products/pwf-716-a-little-lit.jpg',
          checkout: { variantId: 50250877632679, title: 'A Little Lit' }
        },
        {
          key: 'biggie-smalls',
          name: 'Biggie Smalls',
          swatch: '#2f2b25',
          image: 'assets/img/products/pwf-716-biggie-smalls.jpg',
          checkout: { variantId: 50250877599911, title: 'Biggie Smalls' }
        },
        {
          key: 'ogre',
          name: 'Ogre',
          swatch: '#505237',
          image: 'assets/img/products/pwf-716-ogre.jpg',
          checkout: { variantId: 50250877665447, title: 'Ogre' }
        }
      ]
    }
  ];

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
      return product.key === key ||
        product.slug === key ||
        product.legacyProductId === key ||
        product.legacyShopifyKey === key ||
        product.key === normalized ||
        product.slug === normalized;
    }) || null;
  }

  function getColor(product, colorKey) {
    if (!product) return null;
    var normalized = normalizeKey(colorKey);

    return product.colors.find(function (color) {
      return color.key === colorKey || color.key === normalized;
    }) || null;
  }

  function getColorByName(product, colorName) {
    if (!product) return null;
    var normalized = normalizeKey(colorName);

    return product.colors.find(function (color) {
      return color.key === normalized || normalizeKey(color.name) === normalized;
    }) || null;
  }

  function getWeight(product, weightKey) {
    if (!product) return null;
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

    return product.rattle.options || RATTLE_OPTIONS;
  }

  function getRattleOption(product, rattleKey) {
    var fallbackKey = product && product.rattle ? product.rattle.defaultKey : 'no';
    var key = normalizeKey(rattleKey || fallbackKey || 'no');
    var options = getRattleOptions(product);

    return options.find(function (option) {
      return option.key === key;
    }) || options[0];
  }

  function getCheckoutMapping(product, color, weight, rattle) {
    if (!product || !color || !weight || !rattle || !color.checkout) {
      return null;
    }

    if (weight.key !== product.defaultWeightKey) {
      return null;
    }

    if (rattle.key !== 'no') {
      return null;
    }

    return color.checkout;
  }

  function getJigBuild(selection) {
    var product = getProduct(selection && selection.productKey);
    if (!product) return null;

    var color = getColor(product, selection.colorKey) || getColor(product, product.defaultColorKey) || product.colors[0];
    var weight = getWeight(product, selection.weightKey) || getWeight(product, product.defaultWeightKey) || product.weights[0];
    var rattle = getRattleOption(product, selection.rattleKey);
    var price = product.basePrice + (weight.priceDelta || 0) + (rattle.priceDelta || 0);
    var checkoutMapping = getCheckoutMapping(product, color, weight, rattle);
    var id = [product.key, color.key, weight.key, rattle.key].join(':');

    return {
      id: id,
      productKey: product.key,
      productTitle: product.title,
      colorKey: color.key,
      colorName: color.name,
      weightKey: weight.key,
      weightLabel: weight.label,
      rattleKey: rattle.key,
      rattleLabel: rattle.label,
      hasRattle: rattle.key === 'yes',
      price: price,
      image: color.image,
      checkoutMapping: checkoutMapping,
      isCheckoutable: Boolean(checkoutMapping && checkoutMapping.variantId)
    };
  }

  function findProductByVariantId(variantId) {
    var id = String(variantId);
    var match = null;

    PRODUCTS.some(function (product) {
      return product.colors.some(function (color) {
        if (color.checkout && String(color.checkout.variantId) === id) {
          match = { product: product, color: color };
          return true;
        }

        return false;
      });
    });

    return match;
  }

  function getSearchText(product) {
    if (!product) return '';

    return [
      product.title,
      product.shortTitle,
      product.search,
      product.weights.map(function (weight) { return weight.label; }).join(' '),
      product.colors.map(function (color) { return color.name; }).join(' ')
    ].join(' ').toLowerCase();
  }

  function assetPath(path) {
    if (!path || /^(https?:)?\/\//.test(path) || path.charAt(0) === '/' || path.indexOf('../') === 0) {
      return path;
    }

    var locationPath = root.location && root.location.pathname ? root.location.pathname : '';
    var inProductPage = /\/products\//.test(locationPath);

    return inProductPage ? '../' + path : path;
  }

  function formatMoney(value) {
    return '$' + Number(value || 0).toFixed(2);
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
    getJigBuild: getJigBuild,
    findProductByVariantId: findProductByVariantId,
    getSearchText: getSearchText,
    assetPath: assetPath,
    formatMoney: formatMoney,
    normalizeKey: normalizeKey
  };

  root.BassBingeCatalog = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
