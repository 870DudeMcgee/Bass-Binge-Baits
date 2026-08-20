(function (root) {
  'use strict';

  var catalog = root.BassBingeCatalog;
  var cart = root.BassBingeCart;
  var taxonomy = root.BassBingeTaxonomy;
  var shopTaxonomyControls = root.BassBingeShopTaxonomyControls;

  if (!catalog || !cart || !taxonomy || !shopTaxonomyControls) return;

  function init() {

  var productSearch = document.querySelector('[data-product-search]');
  var productEmpty = document.querySelector('[data-shop-empty]');
  var filterButtons = Array.from(document.querySelectorAll('[data-product-filter]'));
  var colorFilter = document.querySelector('[data-color-filter]');
  var priceFilter = document.querySelector('[data-price-filter]');
  var availabilityFilter = document.querySelector('[data-availability-filter]');
  var sizeFilter = document.querySelector('[data-size-filter]');
  var legacyCategory = taxonomy.shopCategoryFromPath(root.location && root.location.pathname);
  var activeFilter = 'all';
  var activeColor = 'all';
  var activePrice = 'all';
  var activeAvailability = 'checkout-ready';
  var activeSize = 'all';
  var initialDepartment = legacyCategory === 'apparel' ? 'lifestyle-and-gear' : 'fishing';
  var initialSubcategory = legacyCategory === 'all' ? null : legacyCategory;
  var taxonomyControls = shopTaxonomyControls.createShopTaxonomyControls({
    document: document,
    taxonomy: taxonomy,
    initialDepartment: initialDepartment,
    initialSubcategory: initialSubcategory,
    onChange: function () {
      configureShopView();
      populateColorFilter();
      populateSizeFilter();
      applyProductFilters();
    }
  });
  var relevantFilters = shopTaxonomyControls.createShopRelevantFilters({
    document: document,
    onReset: resetFilterControl
  });
  shopTaxonomyControls.createShopFilterPanel({ document: document });

  function isCurrentCategory(product) {
    return taxonomyControls.matchesProduct(product);
  }

  function currentShopKey() {
    var selection = taxonomyControls.getSelection();
    return selection.subcategory || selection.department;
  }

  function currentShopLabel() {
    return {
      fishing: 'Fishing products',
      'lifestyle-and-gear': 'Lifestyle & Gear products',
      jigs: 'Jigs',
      trailers: 'Trailers',
      apparel: 'Apparel',
      headwear: 'Headwear',
      drinkware: 'Drinkware',
      bags: 'Bags',
      accessories: 'Accessories'
    }[currentShopKey()];
  }

  function configureShopView() {
    var copy = {
      fishing: ['Shop Fishing', 'Build your box with proven Bass Binge profiles.', 'Browse jigs and trailers without leaving the shop.'],
      'lifestyle-and-gear': ['Shop Lifestyle & Gear', 'Rep Bass Binge on and off the water.', 'Browse apparel, headwear, drinkware, bags, and accessories.'],
      jigs: ['Shop Jigs', 'Build your box with proven Bass Binge profiles.', 'Choose a profile, weight, and checkout-ready color for the water you fish.'],
      trailers: ['Shop Jig Trailers', 'Complete your finesse presentation.', 'Pair a Chopped Craw with a + Series jig or stock up for your favorite finesse rig.'],
      apparel: ['Shop Apparel', 'Rep Bass Binge on and off the water.', 'Choose options on each product page, then check out securely with Shopify.'],
      headwear: ['Shop Headwear', 'Top off your Bass Binge kit.', 'Choose your headwear, then check out securely with Shopify.'],
      drinkware: ['Shop Drinkware', 'Keep Bass Binge close between casts.', 'Choose your drinkware, then check out securely with Shopify.'],
      bags: ['Shop Bags', 'Carry your Bass Binge gear.', 'Choose your bag, then check out securely with Shopify.'],
      accessories: ['Shop Accessories', 'Round out your Bass Binge setup.', 'Choose your accessories, then check out securely with Shopify.']
    }[currentShopKey()];
    var kicker = document.querySelector('[data-shop-kicker]');
    var title = document.querySelector('[data-shop-title]');
    var intro = document.querySelector('[data-shop-intro]');
    if (kicker) kicker.textContent = copy[0];
    if (title) title.textContent = copy[1];
    if (intro) intro.textContent = copy[2];
    document.body.dataset.shopCategory = currentShopKey();
    syncRelevantFilters();
  }

  function resetFilterControl(name) {
    if (name === 'jig-profile') {
      activeFilter = 'all';
      filterButtons.forEach(function (button) {
        var selected = button.dataset.productFilter === 'all';
        button.classList.toggle('active', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    }
    if (name === 'color') {
      activeColor = 'all';
      if (colorFilter) colorFilter.value = 'all';
    }
    if (name === 'price') {
      activePrice = 'all';
      if (priceFilter) priceFilter.value = 'all';
    }
    if (name === 'availability') {
      activeAvailability = 'all';
      if (availabilityFilter) availabilityFilter.value = 'all';
    }
    if (name === 'size') {
      activeSize = 'all';
      if (sizeFilter) sizeFilter.value = 'all';
    }
  }

  function activeProductFilterData() {
    return catalog.listProducts().filter(function (product) {
      return product.shopVisible !== false && isCurrentCategory(product);
    }).map(function (product) {
      var admitted = catalog.getAdmittedProduct(product.handle);
      var optionNames = (admitted && admitted.options || []).map(function (option) {
        return taxonomy.normalizeKey(option.name);
      });
      return {
        hasColor: Boolean(product.colors.length || optionNames.some(function (name) { return name.indexOf('color') >= 0; })),
        hasSize: optionNames.includes('size'),
        price: Number(product.basePrice),
        checkoutReady: hasCheckoutableDefault(product)
      };
    });
  }

  function syncRelevantFilters() {
    relevantFilters.sync(taxonomyControls.getSelection(), activeProductFilterData());
  }

  function selectedColor(product, select) {
    if (!select.value) return null;
    return catalog.getColor(product, select.value);
  }

  function updateSelectedProduct(card, product, select, swatches, addButton) {
    var color = selectedColor(product, select);
    var build = color && catalog.getJigBuild({
      productKey: product.key,
      colorKey: color.key,
      weightKey: product.defaultWeightKey,
      rattleKey: 'no'
    });
    var mediaImage = card.querySelector('.product-media img');
    var priceNode = card.querySelector('.product-price');

    if (mediaImage) {
      mediaImage.src = catalog.assetPath(color ? color.image : product.featuredImage);
      mediaImage.alt = color
        ? product.title + ' in ' + color.name
        : product.featuredImageAlt || product.title + ' color collection';
    }

    if (priceNode) {
      priceNode.textContent = catalog.formatMoney(build ? build.price : product.basePrice);
    }

    if (addButton) {
      addButton.disabled = !build || !build.isCheckoutable;
      addButton.textContent = !color
        ? 'Choose a Color'
        : build && build.isCheckoutable ? 'Add to Cart' : 'Unavailable Online';
    }

    swatches.querySelectorAll('[data-color-key]').forEach(function (swatch) {
      swatch.setAttribute('aria-pressed', String(Boolean(color && swatch.dataset.colorKey === color.key)));
    });
  }

  function hasColor(product, colorKey, checkoutReadyOnly) {
    var projectedMatch = product.colors.some(function (color) {
      if (color.key !== colorKey) return false;
      if (!checkoutReadyOnly) return true;

      return catalog.isBuildCheckoutable({
          productKey: product.key,
          colorKey: color.key,
          weightKey: product.defaultWeightKey,
          rattleKey: 'no'
        });
    });
    if (projectedMatch || product.colors.length) return projectedMatch;
    var admitted = catalog.getAdmittedProduct(product.handle);
    return Boolean(admitted && (admitted.variants || []).some(function (variant) {
      if (checkoutReadyOnly && !variant.availableForSale) return false;
      return (variant.selectedOptions || []).some(function (option) {
        return taxonomy.normalizeKey(option.name).indexOf('color') >= 0 && taxonomy.normalizeKey(option.value) === colorKey;
      });
    }));
  }

  function hasCheckoutableColor(product, colorKey) {
    return hasColor(product, colorKey, true);
  }

  function priceMatches(product) {
    if (activePrice === 'under-525') {
      return product.basePrice < 5.25;
    }

    if (activePrice === '5') {
      return product.basePrice === 5;
    }

    return true;
  }

  function hasCheckoutableDefault(product) {
    if (product.detailOnly) return true;
    return Boolean(catalog.firstCheckoutableColor(product, product.defaultWeightKey, 'no'));
  }

  function populateColorFilter() {
    var colorMap = {};

    if (!colorFilter) return;

    colorFilter.textContent = '';
    var defaultOption = document.createElement('option');
    defaultOption.value = 'all';
    defaultOption.textContent = activeAvailability === 'checkout-ready' ? 'All checkout-ready colors' : 'All colors';
    colorFilter.appendChild(defaultOption);

    catalog.listProducts().filter(function (product) {
      return product.shopVisible !== false && isCurrentCategory(product);
    }).forEach(function (product) {
      if (!product.colors.length) {
        var admitted = catalog.getAdmittedProduct(product.handle);
        (admitted && admitted.options || []).forEach(function (option) {
          if (taxonomy.normalizeKey(option.name).indexOf('color') < 0) return;
          (option.values || []).forEach(function (value) {
            colorMap[taxonomy.normalizeKey(value.name)] = value.name;
          });
        });
      }
      product.colors.forEach(function (color) {
        if (activeAvailability === 'checkout-ready' && !hasCheckoutableColor(product, color.key)) {
          return;
        }

        colorMap[color.key] = color.name;
      });
    });

    Object.keys(colorMap).sort(function (a, b) {
      return colorMap[a].localeCompare(colorMap[b]);
    }).forEach(function (key) {
      var option = document.createElement('option');
      option.value = key;
      option.textContent = colorMap[key];
      colorFilter.appendChild(option);
    });
  }

  function populateSizeFilter() {
    if (!sizeFilter || taxonomyControls.getSelection().subcategory !== 'apparel') return;
    var sizes = {};
    catalog.listProducts().filter(isCurrentCategory).forEach(function (product) {
      var admitted = catalog.getAdmittedProduct(product.handle);
      (admitted && admitted.options || []).forEach(function (option) {
        if (taxonomy.normalizeKey(option.name) !== 'size') return;
        (option.values || []).forEach(function (value) { sizes[value.name] = true; });
      });
    });
    sizeFilter.textContent = '';
    var all = document.createElement('option');
    all.value = 'all'; all.textContent = 'All sizes'; sizeFilter.appendChild(all);
    Object.keys(sizes).forEach(function (size) {
      var option = document.createElement('option');
      option.value = taxonomy.normalizeKey(size); option.textContent = size; sizeFilter.appendChild(option);
    });
  }

  function productOptionAction(product) {
    var names = (product.optionNames || []).map(taxonomy.normalizeKey);
    var hasSize = names.some(function (name) { return name.indexOf('size') >= 0; });
    var hasColor = names.some(function (name) { return name.indexOf('color') >= 0; });
    if (hasSize && hasColor) return 'Choose size & color';
    if (hasSize) return 'Choose size';
    if (hasColor) return 'Choose color';
    return 'View details';
  }

  function sizeMatches(product) {
    if (activeSize === 'all') return true;
    var admitted = catalog.getAdmittedProduct(product.handle);
    return Boolean(admitted && (admitted.variants || []).some(function (variant) {
      return variant.availableForSale && (variant.selectedOptions || []).some(function (option) {
        return taxonomy.normalizeKey(option.name) === 'size' && taxonomy.normalizeKey(option.value) === activeSize;
      });
    }));
  }

  function buildShopControls(card, product, detailsLink) {
    var controls = document.createElement('div');
    var swatches = document.createElement('div');
    var label = document.createElement('label');
    var select = document.createElement('select');
    var purchaseRow = document.createElement('div');
    var stepper = document.createElement('div');
    var quantityInput = document.createElement('input');
    var decrease = document.createElement('button');
    var increase = document.createElement('button');
    var addButton = document.createElement('button');
    var detail = detailsLink;

    controls.className = 'product-selector';
    if (product.detailOnly) {
      controls.classList.add('product-selector-detail-only');
      if (detail) {
        detail.href = catalog.assetPath(product.pagePath);
        detail.textContent = taxonomy.categoryForProduct(product) === 'apparel' ? productOptionAction(product) : 'View details';
        detail.classList.remove('btn', 'btn-primary');
        detail.classList.add('text-button', 'product-detail-link');
        controls.appendChild(detail);
      }
      var detailNote = document.createElement('p');
      detailNote.className = 'quick-add-note';
      detailNote.textContent = taxonomy.categoryForProduct(product) === 'apparel'
        ? 'Choose exact product options on the product page.'
        : 'Choose exact Shopify options on the product page.';
      controls.appendChild(detailNote);
      return controls;
    }

    swatches.className = 'variant-swatches';
    label.className = 'field-label';
    purchaseRow.className = 'product-purchase-row';
    stepper.className = 'quantity-stepper';
    addButton.className = 'btn btn-primary add-cart-button';

    label.textContent = 'Color';
    select.setAttribute('aria-label', 'Color for ' + product.title);

    var placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = 'Choose a color';
    placeholderOption.selected = true;
    select.appendChild(placeholderOption);

    product.colors.forEach(function (color) {
      var option = document.createElement('option');
      var swatch = document.createElement('button');
      var swatchFill = document.createElement('span');
      var isCheckoutable = catalog.isBuildCheckoutable({
        productKey: product.key,
        colorKey: color.key,
        weightKey: product.defaultWeightKey,
        rattleKey: 'no'
      });

      option.value = color.key;
      option.textContent = color.name;
      option.disabled = !isCheckoutable;
      select.appendChild(option);

      swatch.type = 'button';
      swatch.className = 'swatch-button';
      swatch.dataset.colorKey = color.key;
      swatch.disabled = !isCheckoutable;
      swatch.classList.toggle('is-unavailable', !isCheckoutable);
      swatch.style.setProperty('--swatch', color.swatch);
      swatch.setAttribute('aria-label', 'Select ' + color.name + ' for ' + product.title);
      swatch.setAttribute('aria-pressed', 'false');
      swatch.title = isCheckoutable ? color.name : color.name + ' is not available for online checkout yet';
      swatch.appendChild(swatchFill);
      swatches.appendChild(swatch);
    });

    decrease.type = 'button';
    decrease.textContent = '-';
    decrease.setAttribute('aria-label', 'Decrease quantity');

    quantityInput.type = 'number';
    quantityInput.inputMode = 'numeric';
    quantityInput.min = '1';
    quantityInput.max = '99';
    quantityInput.value = '1';
    quantityInput.setAttribute('aria-label', 'Quantity');

    increase.type = 'button';
    increase.textContent = '+';
    increase.setAttribute('aria-label', 'Increase quantity');

    addButton.type = 'button';
    addButton.textContent = 'Add to Cart';

    stepper.appendChild(decrease);
    stepper.appendChild(quantityInput);
    stepper.appendChild(increase);
    purchaseRow.appendChild(stepper);
    purchaseRow.appendChild(addButton);
    label.appendChild(select);
    controls.appendChild(swatches);
    controls.appendChild(label);
    controls.appendChild(purchaseRow);

    if (detail) {
      detail.href = catalog.assetPath(product.pagePath);
      detail.textContent = product.rattle.available || product.weights.length > 1 ? 'Choose weight/rattle' : 'View details';
      detail.classList.remove('btn', 'btn-primary');
      detail.classList.add('text-button', 'product-detail-link');
      controls.appendChild(detail);
    }

    var quickAddNote = document.createElement('p');
    quickAddNote.className = 'quick-add-note';
    quickAddNote.textContent = taxonomy.categoryForProduct(product) === 'apparel'
      ? 'Quick add a checkout-ready color, or open the product for full details.'
      : 'Quick add a checkout-ready color, or open details for weight and rattle options.';
    controls.insertBefore(quickAddNote, purchaseRow);

    decrease.addEventListener('click', function () {
      quantityInput.value = String(Math.max(1, Number(quantityInput.value) - 1 || 1));
    });

    increase.addEventListener('click', function () {
      quantityInput.value = String(Math.min(99, Number(quantityInput.value) + 1 || 2));
    });

    quantityInput.addEventListener('input', function () {
      quantityInput.value = String(Math.max(1, Math.min(99, Number(quantityInput.value) || 1)));
    });

    select.addEventListener('change', function () {
      updateSelectedProduct(card, product, select, swatches, addButton);
    });

    swatches.addEventListener('click', function (event) {
      var swatch = event.target.closest('[data-color-key]');
      if (!swatch || swatch.disabled) return;

      select.value = swatch.dataset.colorKey;
      updateSelectedProduct(card, product, select, swatches, addButton);
    });

    addButton.addEventListener('click', function () {
      var color = selectedColor(product, select);
      if (!color) return;
      var build = cart.addJigBuild({
        productKey: product.key,
        colorKey: color.key,
        weightKey: product.defaultWeightKey,
        rattleKey: 'no'
      }, quantityInput.value);

      if (build) {
        cart.showToast(build.colorName + ' added to cart');
        cart.openCart();
      }
    });

    card.dataset.productSearch = catalog.getSearchText(product);
    updateSelectedProduct(card, product, select, swatches, addButton);

    return controls;
  }

  function isInteractiveCardTarget(target) {
    return Boolean(target && target.closest([
      'a',
      'button',
      'input',
      'select',
      'textarea',
      'label',
      '[role="button"]',
      '[data-cart-open]',
      '[data-color-key]',
      '.product-selector',
      '.variant-swatches',
      '.quantity-stepper',
      '.product-detail-link'
    ].join(',')));
  }

  function wireCardNavigation(card, product) {
    var pagePath = product && product.pagePath ? catalog.assetPath(product.pagePath) : '';

    if (!pagePath || card.dataset.cardNavigationWired === 'true') {
      return;
    }

    card.classList.add('is-clickable');
    card.dataset.cardNavigationWired = 'true';
    card.addEventListener('click', function (event) {
      if (event.defaultPrevented || isInteractiveCardTarget(event.target)) {
        return;
      }

      root.location.href = pagePath;
    });
  }

  function setupProductCards() {
    var grid = document.querySelector('.shop-product-grid');
    if (grid) grid.textContent = '';
  }

  function createProductCard(product) {
    var productCategory = taxonomy.categoryForProduct(product);
    var isJewelCraw = product.handle === 'chopped-craw-6-pack';
    var card = document.createElement('article');
    card.className = 'product-card';
    card.dataset.shopProduct = product.key;
    card.dataset.productCategory = productCategory;

    var media = document.createElement('div');
    media.className = 'product-media';
    if (product.featuredImage || (product.colors[0] && product.colors[0].image)) {
      var img = document.createElement('img');
      img.src = catalog.assetPath(product.featuredImage || product.colors[0].image);
      img.alt = product.featuredImageAlt || product.title;
      media.appendChild(img);
    } else {
      var placeholder = document.createElement('div');
      placeholder.className = 'product-media-placeholder';
      placeholder.setAttribute('role', 'img');
      placeholder.setAttribute('aria-label', 'Product image unavailable for ' + product.title);
      placeholder.textContent = 'Product image coming soon';
      media.appendChild(placeholder);
    }
    card.appendChild(media);

    var top = document.createElement('div');
    top.className = 'product-top';
    var titleEl = document.createElement('h3');
    titleEl.textContent = product.title;
    var priceEl = document.createElement('p');
    priceEl.className = 'product-price';
    priceEl.textContent = catalog.formatMoney(product.basePrice);
    top.appendChild(titleEl);
    top.appendChild(priceEl);
    card.appendChild(top);

    if (product.description) {
      var desc = document.createElement('p');
      desc.textContent = isJewelCraw
        ? product.description.replace(/\bJewell? Baits\b/gi, 'Jewel Bait Company')
        : product.description;
      card.appendChild(desc);
    }

    var isJig = productCategory === 'jigs';
    if (isJig || isJewelCraw) {
      var coBrand = document.createElement('div');
      coBrand.className = 'co-brand-badge';
      coBrand.innerHTML = '<img src="' + catalog.assetPath('assets/img/jewel-bait-logo.png') + '" alt="Jewel Bait Company" />' +
        (isJewelCraw
          ? '<div><strong>Jewel Finesse Craw</strong>' +
            '<span class="co-brand-detail">Made by Jewel Bait Company for finesse presentations</span></div>'
          : '<div><strong>Built with Jewel Bait Company jigheads</strong>' +
            '<span class="co-brand-detail">Crafting quality fishing components in the Ozarks</span></div>');
      card.appendChild(coBrand);
    }

    var tags = document.createElement('div');
    tags.className = 'product-tags';
    if (product.detailOnly) {
      (product.optionNames || []).forEach(function (name) {
        tags.appendChild(makeTag(name));
      });
      if (!(product.optionNames || []).length) {
        tags.appendChild(makeTag('Single option'));
      }
    } else {
      product.weights.forEach(function (weight) {
        tags.appendChild(makeTag(weight.label + ' oz'));
      });
      tags.appendChild(makeTag(product.colors.length + ' colors'));
    }
    card.appendChild(tags);

    var detailLink = document.createElement('a');
    detailLink.className = 'btn btn-primary';
    detailLink.href = catalog.assetPath(product.pagePath);
    detailLink.textContent = product.detailOnly ? 'Choose options' : 'Add Options';
    card.appendChild(detailLink);

    return card;
  }

  function makeTag(label) {
    var span = document.createElement('span');
    span.textContent = label;
    return span;
  }

  function injectDynamicProducts() {
    var grid = document.querySelector('.shop-product-grid');
    if (!grid) return;

    catalog.listProducts().forEach(function (product) {
      if (product.shopVisible === false) return;
      var existing = grid.querySelector('[data-shop-product="' + product.key + '"]');
      if (existing) return;

      var card = createProductCard(product);
      grid.appendChild(card);

      if (!card.querySelector('.product-selector')) {
        card.appendChild(buildShopControls(card, product, card.querySelector('a[href]')));
      }
      wireCardNavigation(card, product);
    });
  }

  function applyProductFilters() {
    var query = productSearch ? productSearch.value.trim().toLowerCase() : '';
    var visibleCount = 0;
    var categoryProductCount = 0;

    document.querySelectorAll('.product-card').forEach(function (card) {
      var product = catalog.getProduct(card.dataset.shopProduct);
      var haystack = (card.textContent + ' ' + (card.dataset.productSearch || '')).toLowerCase();
      var matchesSearch = !query || haystack.indexOf(query) >= 0;
      var matchesCategory = product && isCurrentCategory(product);
      categoryProductCount += matchesCategory ? 1 : 0;
      var matchesFilter = taxonomyControls.getSelection().subcategory !== 'jigs' || activeFilter === 'all' || haystack.indexOf(activeFilter) >= 0;
      var matchesColor = activeColor === 'all' || (product && hasColor(product, activeColor, activeAvailability === 'checkout-ready'));
      var matchesPrice = !product || priceMatches(product);
      var matchesAvailability = activeAvailability !== 'checkout-ready' || (product && hasCheckoutableDefault(product));
      var matchesSize = taxonomyControls.getSelection().subcategory !== 'apparel' || !product || sizeMatches(product);
      var isVisible = matchesCategory && matchesSearch && matchesFilter && matchesColor && matchesPrice && matchesAvailability && matchesSize;

      card.hidden = !isVisible;
      visibleCount += isVisible ? 1 : 0;
    });

    if (productEmpty) {
      productEmpty.textContent = categoryProductCount
        ? 'No ' + currentShopLabel().toLowerCase() + ' match those filters.'
        : 'No ' + currentShopLabel().toLowerCase() + ' are currently available online.';
      productEmpty.hidden = visibleCount > 0;
    }
  }

  configureShopView();
  setupProductCards();
  injectDynamicProducts();
  var productGrid = document.querySelector('.shop-product-grid');
  if (productGrid) productGrid.hidden = false;
  populateColorFilter();
  populateSizeFilter();
  applyProductFilters();
  if (productEmpty && catalog.status && catalog.status.source === 'unavailable') {
    productEmpty.textContent = 'The live catalog is temporarily unavailable. Please try again in a moment.';
    productEmpty.hidden = false;
  }

  if (productSearch) {
    productSearch.addEventListener('input', applyProductFilters);
  }

  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      activeFilter = button.dataset.productFilter;
      filterButtons.forEach(function (filterButton) {
        filterButton.classList.toggle('active', filterButton === button);
        filterButton.setAttribute('aria-pressed', String(filterButton === button));
      });
      applyProductFilters();
    });
  });

  if (colorFilter) {
    colorFilter.addEventListener('change', function () {
      activeColor = colorFilter.value;
      applyProductFilters();
    });
  }

  if (priceFilter) {
    priceFilter.addEventListener('change', function () {
      activePrice = priceFilter.value;
      applyProductFilters();
    });
  }

  if (availabilityFilter) {
    availabilityFilter.addEventListener('change', function () {
      activeAvailability = availabilityFilter.value;
      if (colorFilter && activeColor !== 'all') {
        activeColor = 'all';
        colorFilter.value = 'all';
      }
      populateColorFilter();
      applyProductFilters();
    });
  }

  if (sizeFilter) {
    sizeFilter.addEventListener('change', function () {
      activeSize = sizeFilter.value;
      applyProductFilters();
    });
  }

  }

  Promise.resolve(catalog.ready).then(init);
})(window);
