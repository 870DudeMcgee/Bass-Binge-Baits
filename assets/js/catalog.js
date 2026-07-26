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

  var RATTLE_OPTIONS = [
    { key: 'no', label: 'No', priceDelta: 0 },
    { key: 'yes', label: 'Yes', priceDelta: 0.5 }
  ];

  var NO_RATTLE_OPTIONS = [
    { key: 'no', label: 'No', priceDelta: 0 }
  ];

  var PRODUCTS = [
    {
      key: 'heartlander-limited-drop',
      legacyProductId: 'heartlander-limited-drop',
      legacyShopifyKey: 'limited-drop',
      slug: 'heartlander-limited-drop',
      handle: 'limited-drop',
      pagePath: 'products/limited-drop',
      shopVisible: true,
      isLimitedDrop: true,
      title: '5/8 oz Pee Wee Football HD — Heartlander',
      shortTitle: 'Heartlander Limited Drop',
      search: 'limited drop heartlander 5/8 pee wee peewee football hd stardust',
      basePrice: 5.99,
      featuredImage: 'assets/img/products/pwf-hd-58-heartlander.jpg',
      defaultColorKey: 'heartlander',
      defaultWeightKey: '5-8',
      rattle: {
        available: false,
        defaultKey: 'no',
        options: NO_RATTLE_OPTIONS
      },
      weights: [
        { key: '5-8', label: '5/8', priceDelta: 0 }
      ],
      colors: [
        {
          key: 'heartlander',
          name: 'Heartlander',
          swatch: '#51433f',
          image: 'assets/img/products/pwf-hd-58-heartlander.jpg',
          checkout: { variantId: 50930219843751, title: 'Default Title' }
        }
      ]
    },
    {
      key: 'peewee-spider-hd',
      legacyProductId: 'peewee-spider-hd',
      legacyShopifyKey: 'peewee-spider-hd-5-16',
      slug: 'peewee-spider-hd',
      handle: '5-16-peewee-spider-hd-finesse-cut',
      pagePath: 'products/peewee-spider-hd',
      title: '5/16 PeeWee Spider HD',
      shortTitle: 'PeeWee Spider HD',
      search: '5/16 peewee spider hd finesse cut blackberry smoothie magic brownie fine ryry special fine biggie smalls a little lit ogre',
      basePrice: 5,
      featuredImage: 'assets/img/products/pro-spider-5-16.jpg',
      defaultColorKey: 'blackberry-smoothie',
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
          image: 'assets/img/products/pshd-a-little-lit.jpg',
          checkout: { variantId: 50253364265127, title: 'Blackberry Smoothie' }
        },
        {
          key: 'magic-brownie-fine',
          name: 'Magic Brownie Fine',
          swatch: '#5b3f2f',
          image: 'assets/img/products/pro-spider-5-16.jpg',
          checkout: { variantId: 50253364297895, title: 'Magic Brownie' }
        },
        {
          key: 'ryry-special-fine',
          name: 'RyRy Special Fine',
          swatch: '#6a4e43',
          image: 'assets/img/products/pshd-ryry-special-fine-tight.jpg',
          checkout: { variantId: 50253364330663, title: 'RyRy Special' }
        },
        {
          key: 'biggie-smalls',
          name: 'Biggie Smalls',
          swatch: '#2f2b25',
          image: 'assets/img/products/pshd-ogre.jpg',
          checkout: { variantId: 50253364363431, title: 'Biggie Smalls' }
        },
        {
          key: 'a-little-lit',
          name: 'A Little Lit',
          swatch: '#79513a',
          image: 'assets/img/products/pshd-blackberry-smoothie.jpg',
          checkout: { variantId: 50253364396199, title: 'A Little Lit' }
        },
        {
          key: 'ogre',
          name: 'Ogre',
          swatch: '#505237',
          image: 'assets/img/products/pshd-biggie-smalls.jpg',
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
      pagePath: 'products/peewee-football-hd',
      title: '1/2 PeeWee Football HD',
      shortTitle: 'PeeWee Football HD',
      search: '1/2 peewee football hd fruit fly bad bo craw essence lit pbj lite smokin pb',
      basePrice: 5,
      featuredImage: 'assets/img/products/pwf-hd-12-bad-bo.jpg',
      defaultColorKey: 'fruit-fly',
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
          key: 'fruit-fly',
          name: 'Fruit Fly',
          swatch: '#6b7365',
          image: 'assets/img/products/pwf-hd-12-bad-bo.jpg',
          checkout: { variantId: 50121369551015, title: 'Fruit Fly' }
        },
        {
          key: 'craw-essence',
          name: 'Craw Essence',
          swatch: '#8a4830',
          image: 'assets/img/products/pwf-hd-12-pbj-lite.jpg',
          checkout: { variantId: 50121430335655, title: 'Craw Essence' }
        },
        {
          key: 'bad-bo',
          name: 'Bad B.O.',
          swatch: '#22352a',
          image: 'assets/img/products/pwf-hd-12-smokin-pb.jpg',
          checkout: { variantId: 50149134336167, title: 'BAD B.O.' }
        },
        {
          key: 'lit',
          name: 'Lit',
          swatch: '#a75c32',
          image: 'assets/img/products/pwf-hd-12-lit-single.jpg',
          checkout: { variantId: 50149443502247, title: 'Lit' }
        },
        {
          key: 'pbj-lite',
          name: 'PBJ Lite',
          swatch: '#5d4a67',
          image: 'assets/img/products/pwf-hd-12-extras.jpg',
          checkout: { variantId: 50149978341543, title: 'PBJ Lite' }
        },
        {
          key: 'smokin-pb',
          name: 'Smokin PB',
          swatch: '#4d4138',
          image: 'assets/img/products/pwf-hd-12-smokin-pb-single.jpg',
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
      pagePath: 'products/heavy-cover-football',
      title: '3/4 Heavy Cover Football',
      shortTitle: 'Heavy Cover Football',
      search: '3/4 heavy cover football fruit fly bad bo craw essence lit pbj lite smokin pb',
      basePrice: 5,
      featuredImage: 'assets/img/products/heavy-cover-football-3-4.jpg',
      defaultColorKey: 'fruit-fly',
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
          key: 'fruit-fly',
          name: 'Fruit Fly',
          swatch: '#6b7365',
          image: 'assets/img/products/heavy-cover-football-3-4.jpg',
          checkout: { variantId: 50212502470823, title: 'Fruit Fly' }
        },
        {
          key: 'craw-essence',
          name: 'Craw Essence',
          swatch: '#8a4830',
          image: 'assets/img/products/hcf-34-craw-essence.jpg',
          checkout: { variantId: 50212502503591, title: 'Craw Essence' }
        },
        {
          key: 'bad-bo',
          name: 'Bad B.O.',
          swatch: '#22352a',
          image: 'assets/img/products/hcf-34-lit.jpg',
          checkout: { variantId: 50212502536359, title: 'BAD B.O.' }
        },
        {
          key: 'lit',
          name: 'Lit',
          swatch: '#a75c32',
          image: 'assets/img/products/hcf-34-pbj-lite.jpg',
          checkout: { variantId: 50212502569127, title: 'Lit' }
        },
        {
          key: 'pbj-lite',
          name: 'PBJ Lite',
          swatch: '#5d4a67',
          image: 'assets/img/products/hcf-34-smokin-pb.jpg',
          checkout: { variantId: 50212502601895, title: 'PBJ Lite' }
        },
        {
          key: 'smokin-pb',
          name: 'Smokin PB',
          swatch: '#4d4138',
          image: 'assets/img/products/hcf-34-extras.jpg',
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
      pagePath: 'products/peewee-football',
      title: '7/16 oz PeeWee Football Jig',
      shortTitle: 'PeeWee Football',
      search: '7/16 peewee football blackberry smoothie magic brownie fine ryry special fine biggie smalls a little lit ogre 5/16 3/16',
      basePrice: 5,
      featuredImage: 'assets/img/products/pwf-716-a-little-lit.jpg',
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
          key: 'blackberry-smoothie',
          name: 'Blackberry Smoothie',
          swatch: '#2d1631',
          image: 'assets/img/products/pwf-716-a-little-lit.jpg',
          checkout: { variantId: 50250391388327, title: 'Blackberry Smoothie' }
        },
        {
          key: 'magic-brownie-fine',
          name: 'Magic Brownie Fine',
          swatch: '#5b3f2f',
          image: 'assets/img/products/pwf-716-ryry-special.jpg',
          checkout: { variantId: 50250725687463, title: 'Magic Brownie' }
        },
        {
          key: 'ryry-special-fine',
          name: 'RyRy Special Fine',
          swatch: '#6a4e43',
          image: 'assets/img/products/pwf-716-ogre.jpg',
          checkout: { variantId: 50250725720231, title: 'RyRy Special' }
        },
        {
          key: 'biggie-smalls',
          name: 'Biggie Smalls',
          swatch: '#2f2b25',
          image: 'assets/img/products/pwf-716-blackberry-smoothie.jpg',
          checkout: { variantId: 50250877599911, title: 'Biggie Smalls' }
        },
        {
          key: 'a-little-lit',
          name: 'A Little Lit',
          swatch: '#79513a',
          image: 'assets/img/products/pwf-716-biggie-smalls.jpg',
          checkout: { variantId: 50250877632679, title: 'A Little Lit' }
        },
        {
          key: 'ogre',
          name: 'Ogre',
          swatch: '#505237',
          image: 'assets/img/products/pwf-716-extras.jpg',
          checkout: { variantId: 50250877665447, title: 'Ogre' }
        }
      ]
    },
    {
      key: 'finesse-jig',
      legacyProductId: 'finesse-jig',
      legacyShopifyKey: 'finesse-jig-5-16',
      slug: 'finesse-jig',
      handle: '5-16-oz-finesse-jig',
      pagePath: 'products/finesse-jig',
      title: '5/16 oz. Finesse Jig +',
      shortTitle: 'Finesse Jig +',
      search: '5/16 finesse jig ball head oshaunessy hook craw trailer blackberry smoothie magic brownie ryry special biggie smalls cool breeze ogre blue blood',
      basePrice: 5,
      featuredImage: 'assets/img/products/finesse-jig-5-16.jpg',
      defaultColorKey: 'blackberry-smoothie',
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
          image: 'assets/img/products/finesse-jig-5-16.jpg',
          checkout: { variantId: 51010267283623, title: 'Blackberry Smoothie' }
        },
        {
          key: 'magic-brownie-fine',
          name: 'Magic Brownie',
          swatch: '#5b3f2f',
          image: 'assets/img/products/finesse-jig-5-16.jpg',
          checkout: { variantId: 51010267316391, title: 'Magic Brownie' }
        },
        {
          key: 'ryry-special-fine',
          name: 'RyRy Special',
          swatch: '#6a4e43',
          image: 'assets/img/products/finesse-jig-5-16.jpg',
          checkout: { variantId: 51010267349159, title: 'RyRy Special' }
        },
        {
          key: 'biggie-smalls',
          name: 'Biggie Smalls',
          swatch: '#2f2b25',
          image: 'assets/img/products/finesse-jig-5-16.jpg',
          checkout: { variantId: 51010267381927, title: 'Biggie Smalls' }
        },
        {
          key: 'cool-breeze',
          name: 'Cool Breeze',
          swatch: '#4a7c8c',
          image: 'assets/img/products/finesse-jig-5-16.jpg',
          checkout: { variantId: 51010267414695, title: 'Cool Breeze' }
        },
        {
          key: 'ogre',
          name: 'Ogre',
          swatch: '#505237',
          image: 'assets/img/products/finesse-jig-5-16.jpg',
          checkout: { variantId: 51010267447463, title: 'Ogre' }
        },
        {
          key: 'blue-blood',
          name: 'Blue Blood',
          swatch: '#3a4a6c',
          image: 'assets/img/products/finesse-jig-5-16.jpg',
          checkout: { variantId: 51010267480231, title: 'Blue Blood' }
        }
      ]
    },
    {
      key: 'pee-wee-football',
      legacyProductId: 'pee-wee-football',
      legacyShopifyKey: 'pee-wee-football',
      slug: 'pee-wee-football',
      handle: 'pee-wee-football',
      pagePath: 'products/pee-wee-football',
      title: 'Pee Wee Football +',
      shortTitle: 'Pee Wee Football +',
      search: 'pee wee football plus 3/16 5/16 7/16 blackberry smoothie magic brownie ryry special biggie smalls cool breeze ogre blue blood',
      basePrice: 5,
      featuredImage: 'assets/img/products/pee-wee-football-plus.jpg',
      defaultColorKey: 'blackberry-smoothie',
      defaultWeightKey: '3-16-oz',
      rattle: {
        available: false,
        defaultKey: 'no',
        options: NO_RATTLE_OPTIONS
      },
      weights: [
        { key: '3-16-oz', label: '3/16', priceDelta: 0 },
        { key: '5-16-oz', label: '5/16', priceDelta: 0 },
        { key: '7-16-oz', label: '7/16', priceDelta: 0 }
      ],
      variants: [
        { variantId: 51018167746727, title: 'Blackberry Smoothie / 3/16 oz', colorKey: 'blackberry-smoothie', weightKey: '3-16-oz', price: 5, available: true },
        { variantId: 51018167779495, title: 'Blackberry Smoothie / 5/16 oz', colorKey: 'blackberry-smoothie', weightKey: '5-16-oz', price: 5, available: true },
        { variantId: 51018167812263, title: 'Blackberry Smoothie / 7/16 oz', colorKey: 'blackberry-smoothie', weightKey: '7-16-oz', price: 5, available: true },
        { variantId: 51018167845031, title: 'Magic Brownie / 3/16 oz', colorKey: 'magic-brownie', weightKey: '3-16-oz', price: 5, available: true },
        { variantId: 51018167877799, title: 'Magic Brownie / 5/16 oz', colorKey: 'magic-brownie', weightKey: '5-16-oz', price: 5, available: true },
        { variantId: 51018167910567, title: 'Magic Brownie / 7/16 oz', colorKey: 'magic-brownie', weightKey: '7-16-oz', price: 5, available: true },
        { variantId: 51018167943335, title: 'RyRy Special / 3/16 oz', colorKey: 'ryry-special', weightKey: '3-16-oz', price: 5, available: true },
        { variantId: 51018167976103, title: 'RyRy Special / 5/16 oz', colorKey: 'ryry-special', weightKey: '5-16-oz', price: 5, available: true },
        { variantId: 51018168008871, title: 'RyRy Special / 7/16 oz', colorKey: 'ryry-special', weightKey: '7-16-oz', price: 5, available: true },
        { variantId: 51018168041639, title: 'Biggie Smalls / 3/16 oz', colorKey: 'biggie-smalls', weightKey: '3-16-oz', price: 5, available: true },
        { variantId: 51018168074407, title: 'Biggie Smalls / 5/16 oz', colorKey: 'biggie-smalls', weightKey: '5-16-oz', price: 5, available: true },
        { variantId: 51018168107175, title: 'Biggie Smalls / 7/16 oz', colorKey: 'biggie-smalls', weightKey: '7-16-oz', price: 5, available: true },
        { variantId: 51018168139943, title: 'Cool Breeze / 3/16 oz', colorKey: 'cool-breeze', weightKey: '3-16-oz', price: 5, available: true },
        { variantId: 51018168172711, title: 'Cool Breeze / 5/16 oz', colorKey: 'cool-breeze', weightKey: '5-16-oz', price: 5, available: true },
        { variantId: 51018168205479, title: 'Cool Breeze / 7/16 oz', colorKey: 'cool-breeze', weightKey: '7-16-oz', price: 5, available: true },
        { variantId: 51018168238247, title: 'Ogre / 3/16 oz', colorKey: 'ogre', weightKey: '3-16-oz', price: 5, available: true },
        { variantId: 51018168271015, title: 'Ogre / 5/16 oz', colorKey: 'ogre', weightKey: '5-16-oz', price: 5, available: true },
        { variantId: 51018168303783, title: 'Ogre / 7/16 oz', colorKey: 'ogre', weightKey: '7-16-oz', price: 5, available: true },
        { variantId: 51018168336551, title: 'Blue Blood / 3/16 oz', colorKey: 'blue-blood', weightKey: '3-16-oz', price: 5, available: true },
        { variantId: 51018168369319, title: 'Blue Blood / 5/16 oz', colorKey: 'blue-blood', weightKey: '5-16-oz', price: 5, available: true },
        { variantId: 51018168402087, title: 'Blue Blood / 7/16 oz', colorKey: 'blue-blood', weightKey: '7-16-oz', price: 5, available: true }
      ],
      colors: [
        {
          key: 'blackberry-smoothie',
          name: 'Blackberry Smoothie',
          swatch: '#2d1631',
          image: 'assets/img/products/pee-wee-football-plus.jpg',
          checkout: { variantId: 51018167746727, title: 'Blackberry Smoothie / 3/16 oz' }
        },
        {
          key: 'magic-brownie',
          name: 'Magic Brownie',
          swatch: '#5b3f2f',
          image: 'assets/img/products/pee-wee-football-plus-magic-brownie.jpg',
          checkout: { variantId: 51018167845031, title: 'Magic Brownie / 3/16 oz' }
        },
        {
          key: 'ryry-special',
          name: 'RyRy Special',
          swatch: '#6a4e43',
          image: 'assets/img/products/pee-wee-football-plus-ryry-special.jpg',
          checkout: { variantId: 51018167943335, title: 'RyRy Special / 3/16 oz' }
        },
        {
          key: 'biggie-smalls',
          name: 'Biggie Smalls',
          swatch: '#2f2b25',
          image: 'assets/img/products/pee-wee-football-plus-biggie-smalls.jpg',
          checkout: { variantId: 51018168041639, title: 'Biggie Smalls / 3/16 oz' }
        },
        {
          key: 'cool-breeze',
          name: 'Cool Breeze',
          swatch: '#4a7c8c',
          image: 'assets/img/products/pee-wee-football-plus-cool-breeze.jpg',
          checkout: { variantId: 51018168139943, title: 'Cool Breeze / 3/16 oz' }
        },
        {
          key: 'ogre',
          name: 'Ogre',
          swatch: '#505237',
          image: 'assets/img/products/pee-wee-football-plus-ogre.jpg',
          checkout: { variantId: 51018168238247, title: 'Ogre / 3/16 oz' }
        },
        {
          key: 'blue-blood',
          name: 'Blue Blood',
          swatch: '#3a4a6c',
          image: 'assets/img/products/pee-wee-football-plus-blue-blood.jpg',
          checkout: { variantId: 51018168336551, title: 'Blue Blood / 3/16 oz' }
        }
      ]
    }
  ];
  var RATTLE_ADD_ON = null;
  var CATALOG_STATUS = {
    source: 'fallback',
    fetchedAt: null,
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
    if (!product || !color || !weight || !rattle) {
      return null;
    }
    if (product.commerceDisabled) return null;

    if (Array.isArray(product.variants)) {
      var variant = product.variants.find(function (candidate) {
        return candidate.colorKey === color.key && candidate.weightKey === weight.key;
      });

      if (!variant || !variant.available) return null;
      if (rattle.key === 'yes' && (!RATTLE_ADD_ON || !RATTLE_ADD_ON.available)) return null;

      return {
        id: variant.id,
        merchandiseId: variant.id,
        variantId: variant.variantId,
        title: variant.title,
        price: variant.price,
        available: variant.available
      };
    }

    if (!color.checkout) return null;

    if (weight.key !== product.defaultWeightKey) {
      return null;
    }

    if (rattle.key !== 'no') {
      return null;
    }

    return color.checkout;
  }

  function isBuildCheckoutable(selection) {
    var build = getJigBuild(selection);
    return Boolean(build && build.isCheckoutable);
  }

  function firstCheckoutableColor(product, weightKey, rattleKey) {
    if (!product) return null;

    return product.colors.find(function (color) {
      return isBuildCheckoutable({
        productKey: product.key,
        colorKey: color.key,
        weightKey: weightKey || product.defaultWeightKey,
        rattleKey: rattleKey || (product.rattle && product.rattle.defaultKey) || 'no'
      });
    }) || null;
  }

  function getJigBuild(selection) {
    var product = getProduct(selection && selection.productKey);
    if (!product) return null;

    var color = getColor(product, selection.colorKey) || getColor(product, product.defaultColorKey) || product.colors[0];
    var weight = getWeight(product, selection.weightKey) || getWeight(product, product.defaultWeightKey) || product.weights[0];
    var rattle = getRattleOption(product, selection.rattleKey);
    var checkoutMapping = getCheckoutMapping(product, color, weight, rattle);
    var jigPrice = checkoutMapping && Number.isFinite(Number(checkoutMapping.price))
      ? Number(checkoutMapping.price)
      : product.basePrice + (weight.priceDelta || 0);
    var rattlePrice = rattle.key === 'yes' && RATTLE_ADD_ON
      ? Number(RATTLE_ADD_ON.price || 0)
      : Number(rattle.priceDelta || 0);
    var price = jigPrice + rattlePrice;
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
      rattleMapping: rattle.key === 'yes' ? RATTLE_ADD_ON : null,
      isCheckoutable: Boolean(
        checkoutMapping &&
        (checkoutMapping.merchandiseId || checkoutMapping.variantId) &&
        (rattle.key !== 'yes' || (RATTLE_ADD_ON && RATTLE_ADD_ON.available))
      )
    };
  }

  function findProductByVariantId(variantId) {
    var id = String(variantId);
    var match = null;

    PRODUCTS.some(function (product) {
      var remoteVariant = Array.isArray(product.variants) && product.variants.find(function (variant) {
        return String(variant.variantId) === id || String(variant.id) === id;
      });

      if (remoteVariant) {
        match = {
          product: product,
          color: getColor(product, remoteVariant.colorKey),
          weight: getWeight(product, remoteVariant.weightKey),
          variant: remoteVariant
        };
        return true;
      }

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

  function getCurrentDrop() {
    return PRODUCTS.find(function (product) {
      return product.isLimitedDrop;
    }) || null;
  }

  function applyRemoteCatalog(payload) {
    payload = payload && payload.schemaVersion === 2 && payload.legacy
      ? payload.legacy
      : payload;
    if (!payload || !payload.ok || !Array.isArray(payload.products)) {
      return false;
    }

    PRODUCTS = payload.products.filter(function (product) {
      return product && product.handle && product.pagePath;
    });

    if (payload.currentDrop) {
      PRODUCTS.unshift(payload.currentDrop);
    }

    RATTLE_ADD_ON = payload.rattle || null;
    PRODUCTS.forEach(function (product) {
      if (!product.rattle || !product.rattle.available || !RATTLE_ADD_ON) return;
      product.rattle.options = [
        { key: 'no', label: 'No', priceDelta: 0 },
        { key: 'yes', label: 'Yes', priceDelta: Number(RATTLE_ADD_ON.price || 0) }
      ];
    });
    CATALOG_STATUS = {
      source: payload.source || 'shopify',
      fetchedAt: payload.fetchedAt || null,
      errors: Array.isArray(payload.errors) ? payload.errors : []
    };
    api.products = PRODUCTS;
    api.rattleAddOn = RATTLE_ADD_ON;
    api.status = CATALOG_STATUS;
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
        applyRemoteCatalog(payload);
        return api;
      })
      .catch(function (error) {
        CATALOG_STATUS = {
          source: 'fallback',
          fetchedAt: null,
          errors: [{ code: 'catalog_fallback', message: error.message }]
        };
        api.status = CATALOG_STATUS;
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
