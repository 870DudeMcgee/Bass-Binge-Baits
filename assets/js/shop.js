(function (root) {
  'use strict';

  var catalog = root.BassBingeCatalog;
  var cart = root.BassBingeCart;
  var variantUi = root.BassBingeGenericProduct;

  if (!catalog || !cart || !variantUi) return;

  function init() {

  var productSearch = document.querySelector('[data-product-search]');
  var productEmpty = document.querySelector('[data-shop-empty]');
  var filterButtons = Array.from(document.querySelectorAll('[data-product-filter]'));
  var colorFilter = document.querySelector('[data-color-filter]');
  var priceFilter = document.querySelector('[data-price-filter]');
  var availabilityFilter = document.querySelector('[data-availability-filter]');
  var activeFilter = 'all';
  var activeColor = 'all';
  var activePrice = 'all';
  var activeAvailability = 'checkout-ready';

  function admittedProduct(product) {
    return product && catalog.getAdmittedProduct(product.handle || product.key);
  }

  function optionLooksLikeColor(option, index) {
    return /colou?r/i.test(option && option.name || '') || index === 0;
  }

  function hasColor(product, colorKey, checkoutReadyOnly) {
    var admitted = admittedProduct(product);
    if (!admitted) return false;
    return (admitted.options || []).some(function (option, index) {
      if (!optionLooksLikeColor(option, index)) return false;
      return (option.values || []).some(function (value) {
        if (catalog.normalizeKey(value.name) !== colorKey) return false;
        if (!checkoutReadyOnly) return true;
        return (admitted.variants || []).some(function (variant) {
          return variant.availableForSale &&
            (variant.selectedOptions || []).some(function (selected) {
              return selected.name === option.name && selected.value === value.name;
            });
        });
      });
    });
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
    var admitted = admittedProduct(product);
    return Boolean(admitted && (admitted.variants || []).some(function (variant) {
      return variant.availableForSale;
    }));
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
      return product.shopVisible !== false;
    }).forEach(function (product) {
      var admitted = admittedProduct(product);
      var colorOption = admitted && (admitted.options || []).find(optionLooksLikeColor);
      (colorOption && colorOption.values || []).forEach(function (value) {
        var key = catalog.normalizeKey(value.name);
        if (activeAvailability === 'checkout-ready' && !hasCheckoutableColor(product, key)) return;
        colorMap[key] = value.name;
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

  function buildShopControls(card, product, detailsLink) {
    var admitted = admittedProduct(product);
    var controls = document.createElement('div');
    var swatches = document.createElement('div');
    var optionFields = document.createElement('div');
    var purchaseRow = document.createElement('div');
    var stepper = document.createElement('div');
    var quantityInput = document.createElement('input');
    var decrease = document.createElement('button');
    var increase = document.createElement('button');
    var addButton = document.createElement('button');
    var detail = detailsLink;
    var selection = variantUi.initialSelection(admitted);

    controls.className = 'product-selector';
    swatches.className = 'variant-swatches';
    optionFields.className = 'product-option-fields';
    purchaseRow.className = 'product-purchase-row';
    stepper.className = 'quantity-stepper';
    addButton.className = 'btn btn-primary add-cart-button';

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
    controls.appendChild(swatches);
    controls.appendChild(optionFields);
    controls.appendChild(purchaseRow);

    if (detail) {
      detail.href = catalog.assetPath(product.pagePath);
      detail.textContent = 'View details';
      detail.classList.remove('btn', 'btn-primary');
      detail.classList.add('text-button', 'product-detail-link');
      controls.appendChild(detail);
    }

    var quickAddNote = document.createElement('p');
    quickAddNote.className = 'quick-add-note';
    quickAddNote.textContent = 'Choose every option, then add this exact combination to cart.';
    controls.insertBefore(quickAddNote, purchaseRow);

    function selectedVariant() {
      return variantUi.resolveVariant(admitted, selection);
    }

    function renderControls() {
      var variant = selectedVariant();
      var line = variantUi.buildCartLine(admitted, variant);
      var mediaImage = card.querySelector('.product-media img');
      var priceNode = card.querySelector('.product-price');
      var firstOption = admitted && admitted.options && admitted.options[0];

      optionFields.textContent = '';
      swatches.textContent = '';

      (admitted && admitted.options || []).forEach(function (shopifyOption, optionIndex) {
        var label = document.createElement('label');
        var select = document.createElement('select');
        label.className = 'field-label';
        label.appendChild(document.createTextNode(shopifyOption.name));
        select.setAttribute('aria-label', shopifyOption.name + ' for ' + product.title);

        (shopifyOption.values || []).forEach(function (value) {
          var state = variantUi.optionValueState(admitted, selection, shopifyOption.name, value.name);
          var option = document.createElement('option');
          option.value = value.name;
          option.textContent = value.name;
          option.disabled = !state.available;
          option.selected = selection[shopifyOption.name] === value.name;
          select.appendChild(option);

          if (optionIndex === 0) {
            var swatch = document.createElement('button');
            var swatchFill = document.createElement('span');
            swatch.type = 'button';
            swatch.className = 'swatch-button';
            swatch.dataset.optionValue = value.name;
            swatch.disabled = !state.available;
            swatch.classList.toggle('is-unavailable', !state.available);
            swatch.setAttribute('aria-label', 'Select ' + value.name);
            swatch.setAttribute('aria-pressed', String(selection[shopifyOption.name] === value.name));
            swatch.title = state.available ? value.name : value.name + ' is sold out';
            swatch.appendChild(swatchFill);
            swatches.appendChild(swatch);
          }
        });

        select.addEventListener('change', function () {
          var intent = {};
          Object.keys(selection).forEach(function (name) { intent[name] = selection[name]; });
          intent[shopifyOption.name] = select.value;
          var reachable = variantUi.selectionForOptionIntent(admitted, intent) ||
            variantUi.selectionForOptionIntent(admitted, (function () {
              var single = {};
              single[shopifyOption.name] = select.value;
              return single;
            })());
          if (reachable) selection = reachable;
          renderControls();
        });
        label.appendChild(select);
        optionFields.appendChild(label);
      });

      if (firstOption) {
        swatches.addEventListener('click', function (event) {
          var swatch = event.target.closest('[data-option-value]');
          if (!swatch || swatch.disabled) return;
          var intent = {};
          Object.keys(selection).forEach(function (name) { intent[name] = selection[name]; });
          intent[firstOption.name] = swatch.dataset.optionValue;
          var reachable = variantUi.selectionForOptionIntent(admitted, intent);
          if (reachable) selection = reachable;
          renderControls();
        }, { once: true });
      }

      if (priceNode && variant) priceNode.textContent = variantUi.formatMoney(variant.price);
      if (mediaImage && line && line.image) {
        mediaImage.src = line.image;
        mediaImage.alt = product.title + ' — ' + (variant.selectedOptions || []).map(function (item) {
          return item.value;
        }).join(', ');
      }
      addButton.disabled = !line;
      addButton.textContent = line ? 'Add to Cart' : 'Unavailable';
    }

    decrease.addEventListener('click', function () {
      quantityInput.value = String(Math.max(1, Number(quantityInput.value) - 1 || 1));
    });

    increase.addEventListener('click', function () {
      quantityInput.value = String(Math.min(99, Number(quantityInput.value) + 1 || 2));
    });

    quantityInput.addEventListener('input', function () {
      quantityInput.value = String(Math.max(1, Math.min(99, Number(quantityInput.value) || 1)));
    });

    addButton.addEventListener('click', function () {
      var line = variantUi.buildCartLine(admitted, selectedVariant());
      var added = line && cart.addExactVariant(line, quantityInput.value);
      if (added) {
        cart.showToast(product.title + ' added to cart');
        cart.openCart();
      }
    });

    card.dataset.productSearch = catalog.getSearchText(product);
    renderControls();

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
    var card = document.createElement('article');
    card.className = 'product-card';
    card.dataset.shopProduct = product.key;

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
      desc.textContent = product.description;
      card.appendChild(desc);
    }

    var coBrand = document.createElement('div');
    coBrand.className = 'co-brand-badge';
    coBrand.innerHTML = '<img src="' + catalog.assetPath('assets/img/jewel-bait-logo.png') + '" alt="Jewel Bait Company" />' +
      '<div><strong>Built with Jewel Bait Company jigheads</strong>' +
      '<span class="co-brand-detail">Crafting quality fishing components in the Ozarks</span></div>';
    card.appendChild(coBrand);

    var tags = document.createElement('div');
    tags.className = 'product-tags';
    var admitted = admittedProduct(product);
    var admittedOptions = admitted && admitted.options || [];
    var weightOption = admittedOptions.find(function (option) {
      return /weight/i.test(option.name);
    });
    if (weightOption) {
      (weightOption.values || []).forEach(function (value) {
        tags.appendChild(makeTag(value.name));
      });
    }
    var firstOption = admittedOptions[0];
    if (firstOption && firstOption !== weightOption) {
      tags.appendChild(makeTag((firstOption.values || []).length + ' colors'));
    }
    if (!admittedOptions.length) tags.appendChild(makeTag('Single option'));
    card.appendChild(tags);

    var detailLink = document.createElement('a');
    detailLink.className = 'btn btn-primary';
    detailLink.href = catalog.assetPath(product.pagePath);
    detailLink.textContent = 'Add Options';
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

    document.querySelectorAll('.product-card').forEach(function (card) {
      var product = catalog.getProduct(card.dataset.shopProduct);
      var haystack = (card.textContent + ' ' + (card.dataset.productSearch || '')).toLowerCase();
      var matchesSearch = !query || haystack.indexOf(query) >= 0;
      var matchesFilter = activeFilter === 'all' || haystack.indexOf(activeFilter) >= 0;
      var matchesColor = activeColor === 'all' || (product && hasColor(product, activeColor, activeAvailability === 'checkout-ready'));
      var matchesPrice = !product || priceMatches(product);
      var matchesAvailability = activeAvailability !== 'checkout-ready' || (product && hasCheckoutableDefault(product));
      var isVisible = matchesSearch && matchesFilter && matchesColor && matchesPrice && matchesAvailability;

      card.hidden = !isVisible;
      visibleCount += isVisible ? 1 : 0;
    });

    if (productEmpty) {
      productEmpty.hidden = visibleCount > 0;
    }
  }

  setupProductCards();
  injectDynamicProducts();
  var productGrid = document.querySelector('.shop-product-grid');
  if (productGrid) productGrid.hidden = false;
  populateColorFilter();
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

  }

  Promise.resolve(catalog.ready).then(init);
})(window);
