(function (root) {
  'use strict';

  var catalog = root.BassBingeCatalog;
  var cart = root.BassBingeCart;

  if (!catalog || !cart) return;

  var productSearch = document.querySelector('[data-product-search]');
  var productEmpty = document.querySelector('[data-shop-empty]');
  var filterButtons = Array.from(document.querySelectorAll('[data-product-filter]'));
  var activeFilter = 'all';

  function selectedColor(product, select) {
    return catalog.getColor(product, select.value) ||
      catalog.getColor(product, product.defaultColorKey) ||
      product.colors[0];
  }

  function updateSelectedProduct(card, product, select, swatches, addButton) {
    var color = selectedColor(product, select);
    var build = catalog.getJigBuild({
      productKey: product.key,
      colorKey: color.key,
      weightKey: product.defaultWeightKey,
      rattleKey: 'no'
    });
    var mediaImage = card.querySelector('.product-media img');
    var priceNode = card.querySelector('.product-price');

    select.value = color.key;

    if (mediaImage) {
      mediaImage.src = catalog.assetPath(color.image);
      mediaImage.alt = product.title + ' in ' + color.name;
    }

    if (priceNode && build) {
      priceNode.textContent = catalog.formatMoney(build.price);
    }

    if (addButton) {
      addButton.disabled = !build;
    }

    swatches.querySelectorAll('[data-color-key]').forEach(function (swatch) {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.colorKey === color.key));
    });
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
    swatches.className = 'variant-swatches';
    label.className = 'field-label';
    purchaseRow.className = 'product-purchase-row';
    stepper.className = 'quantity-stepper';
    addButton.className = 'btn btn-primary add-cart-button';

    label.textContent = 'Color';
    select.setAttribute('aria-label', 'Color for ' + product.title);

    product.colors.forEach(function (color) {
      var option = document.createElement('option');
      var swatch = document.createElement('button');
      var swatchFill = document.createElement('span');

      option.value = color.key;
      option.textContent = color.name;
      select.appendChild(option);

      swatch.type = 'button';
      swatch.className = 'swatch-button';
      swatch.dataset.colorKey = color.key;
      swatch.style.setProperty('--swatch', color.swatch);
      swatch.setAttribute('aria-label', 'Select ' + color.name);
      swatch.setAttribute('aria-pressed', String(color.key === product.defaultColorKey));
      swatch.appendChild(swatchFill);
      swatches.appendChild(swatch);
    });

    if (catalog.getColor(product, product.defaultColorKey)) {
      select.value = product.defaultColorKey;
    }

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
      detail.textContent = product.rattle.available || product.weights.length > 1 ? 'Choose weight/rattle' : 'View details';
      detail.classList.remove('btn', 'btn-primary');
      detail.classList.add('text-button', 'product-detail-link');
      controls.appendChild(detail);
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

    select.addEventListener('change', function () {
      updateSelectedProduct(card, product, select, swatches, addButton);
    });

    swatches.addEventListener('click', function (event) {
      var swatch = event.target.closest('[data-color-key]');
      if (!swatch) return;

      select.value = swatch.dataset.colorKey;
      updateSelectedProduct(card, product, select, swatches, addButton);
    });

    addButton.addEventListener('click', function () {
      var color = selectedColor(product, select);
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

  function setupProductCards() {
    document.querySelectorAll('[data-shop-product]').forEach(function (card) {
      var product = catalog.getProduct(card.dataset.shopProduct);
      var link = card.querySelector('a[href]');

      if (!product || card.querySelector('.product-selector')) {
        return;
      }

      card.appendChild(buildShopControls(card, product, link));
    });
  }

  function applyProductFilters() {
    var query = productSearch ? productSearch.value.trim().toLowerCase() : '';
    var visibleCount = 0;

    document.querySelectorAll('.product-card').forEach(function (card) {
      var haystack = (card.textContent + ' ' + (card.dataset.productSearch || '')).toLowerCase();
      var matchesSearch = !query || haystack.indexOf(query) >= 0;
      var matchesFilter = activeFilter === 'all' || haystack.indexOf(activeFilter) >= 0;
      var isVisible = matchesSearch && matchesFilter;

      card.hidden = !isVisible;
      visibleCount += isVisible ? 1 : 0;
    });

    if (productEmpty) {
      productEmpty.hidden = visibleCount > 0;
    }
  }

  setupProductCards();
  applyProductFilters();

  if (productSearch) {
    productSearch.addEventListener('input', applyProductFilters);
  }

  filterButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      activeFilter = button.dataset.productFilter;
      filterButtons.forEach(function (filterButton) {
        filterButton.classList.toggle('active', filterButton === button);
      });
      applyProductFilters();
    });
  });
})(window);
