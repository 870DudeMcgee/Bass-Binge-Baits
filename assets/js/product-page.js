/*
 * Bass Binge Product Page
 * Renders product options from the Bass Binge Product Catalog and keeps the
 * selected Jig Build synchronized with the gallery and cart.
 */

(function () {
  'use strict';

  var configEl = document.querySelector('.product-config');
  if (!configEl) return;

  var catalog = window.BassBingeCatalog;
  if (!catalog) return;

  function renderUnavailable() {
    var main = document.querySelector('.product-page');
    if (!main) return;
    var catalogUnavailable = catalog.status && catalog.status.source === 'unavailable';
    var title = catalogUnavailable ? 'Product temporarily unavailable' : 'Product not found';
    var message = catalogUnavailable
      ? 'The live catalog is temporarily unavailable. Please try again in a moment.'
      : 'This product is not available.';
    main.innerHTML = '<div class="container" style="padding:6rem 1rem">' +
      '<p class="section-kicker">' + (catalogUnavailable ? '503' : '404') + '</p>' +
      '<h1>' + title + '</h1><p>' + message + '</p>' +
      '<a class="btn btn-primary" href="/shop">Back to Shop</a></div>';
    main.hidden = false;
    document.title = title + ' | Bass Binge Baits';
  }

  function init() {
  var productKey = configEl.dataset.productKey || configEl.dataset.productId;
  var product = catalog && configEl.hasAttribute('data-current-drop')
    ? catalog.getCurrentDrop()
    : catalog && catalog.getProduct(productKey);
  if (
    !product ||
    product.detailOnly ||
    !Array.isArray(product.colors) ||
    !product.colors.length ||
    !Array.isArray(product.weights) ||
    !product.weights.length
  ) {
    renderUnavailable();
    return;
  }
  var productPage = document.querySelector('.product-page');
  if (productPage) productPage.hidden = false;
  var productName = product.title;
  var colorOptions = product.colors;
  var weightOptions = product.weights;
  var rattleAvailable = Boolean(product.rattle && product.rattle.available);
  var rattleOptions = catalog.getRattleOptions(product);
  var defaultRattleKey = product.rattle ? product.rattle.defaultKey : 'no';
  var selectedColor = indexForKey(colorOptions, product.defaultColorKey);
  var selectedWeight = indexForKey(weightOptions, product.defaultWeightKey);

  if (selectedColor < 0 || Number.isNaN(selectedColor)) selectedColor = 0;
  if (selectedWeight < 0 || Number.isNaN(selectedWeight)) selectedWeight = 0;

  var swatchesContainer = document.querySelector('.variant-swatches');
  var weightGroup = document.querySelector('[data-weight-group]');
  var rattleGroup = document.querySelector('[data-rattle-group]');
  var colorNameDisplay = document.querySelector('[data-color-name]');
  var priceDisplay = document.querySelector('[data-price-display]');
  var availabilityNode = document.querySelector('[data-product-availability]');
  var addCartBtn = document.querySelector('[data-add-cart]');
  var quantityInput = document.querySelector('[data-quantity-input]');
  var quantityDecrease = document.querySelector('[data-quantity-decrease]');
  var quantityIncrease = document.querySelector('[data-quantity-increase]');
  var heroImg = document.querySelector('.product-hero-img');

  function productQuantity(value) {
    var quantity = parseInt(value, 10);

    if (!Number.isFinite(quantity)) quantity = 1;
    return Math.max(1, Math.min(99, quantity));
  }

  function setProductQuantity(value) {
    var quantity = productQuantity(value);

    if (quantityInput) quantityInput.value = String(quantity);
    return quantity;
  }

  if (quantityDecrease) {
    quantityDecrease.addEventListener('click', function () {
      setProductQuantity((quantityInput ? quantityInput.value : 1) - 1);
    });
  }

  if (quantityIncrease) {
    quantityIncrease.addEventListener('click', function () {
      setProductQuantity(Number(quantityInput ? quantityInput.value : 1) + 1);
    });
  }

  if (quantityInput) {
    quantityInput.addEventListener('input', function () {
      setProductQuantity(quantityInput.value);
    });
    quantityInput.addEventListener('blur', function () {
      setProductQuantity(quantityInput.value);
    });
  }
  var productTitleNode = document.querySelector('.product-hero-title');

  if (productTitleNode) {
    productTitleNode.textContent = product.title;
  }

  function indexForKey(options, key) {
    return options.findIndex(function (option) {
      return option.key === key;
    });
  }

  function optionContainer(group) {
    return group ? group.querySelector('.weight-options') || group : null;
  }

  function imagePath(path) {
    return catalog ? catalog.assetPath(path) : path;
  }

  function selectedColorOption() {
    return colorOptions[selectedColor] || colorOptions[0];
  }

  function selectedWeightOption() {
    return weightOptions[selectedWeight] || weightOptions[0];
  }

  function selectedRattleKey() {
    if (!rattleAvailable) return 'no';

    var checked = document.querySelector('[name="rattle"]:checked');
    return checked ? checked.value : defaultRattleKey;
  }

  function selectedRattleOption() {
    var key = selectedRattleKey();
    return rattleOptions.find(function (option) {
      return option.key === key;
    }) || rattleOptions[0];
  }

  function isSelectionCheckoutable(color, weight, rattleKey) {
    return catalog.isBuildCheckoutable({
      productKey: product.key,
      colorKey: color && color.key,
      weightKey: weight && weight.key,
      rattleKey: rattleKey || 'no'
    });
  }

  function unavailableTitle(name) {
    return name + ' is not available for online checkout yet';
  }

  function selectedBuild() {
    var color = selectedColorOption();
    var weight = selectedWeightOption();
    var rattle = selectedRattleOption();
    return catalog.getJigBuild({
      productKey: product.key,
      colorKey: color.key,
      weightKey: weight.key,
      rattleKey: rattle.key
    });
  }

  function setSelectedColor(index, shouldSyncGallery) {
    selectedColor = Math.max(0, Math.min(index, colorOptions.length - 1));
    updateOptionAvailability();
    updateColorDisplay();

    if (shouldSyncGallery) {
      updateGallery(galleryIndexForColor(selectedColor));
    }
  }

  function updateSwatchStates() {
    if (!swatchesContainer) return;

    swatchesContainer.querySelectorAll('.swatch-button').forEach(function (swatch, index) {
      var color = colorOptions[index];
      var isCheckoutable = isSelectionCheckoutable(color, selectedWeightOption(), selectedRattleKey());

      swatch.classList.toggle('active', index === selectedColor);
      swatch.classList.toggle('is-unavailable', !isCheckoutable);
      swatch.disabled = !isCheckoutable;
      swatch.setAttribute('aria-pressed', String(index === selectedColor));
      swatch.title = isCheckoutable ? color.name : unavailableTitle(color.name);
    });
  }

  function updateWeightStates() {
    var container = optionContainer(weightGroup);
    if (!container) return;

    container.querySelectorAll('.weight-option').forEach(function (option, index) {
      var input = option.querySelector('input');
      var weight = weightOptions[index];
      var label = weight ? weight.label + ' oz' : 'This weight';
      var isCheckoutable = isSelectionCheckoutable(selectedColorOption(), weight, selectedRattleKey());

      option.classList.toggle('active', index === selectedWeight);
      option.classList.toggle('is-unavailable', !isCheckoutable);
      option.title = isCheckoutable ? label : unavailableTitle(label);

      if (input) {
        input.disabled = !isCheckoutable;
      }
    });
  }

  function updateRattleStates() {
    var container = optionContainer(rattleGroup);
    if (!container) return;

    container.querySelectorAll('.weight-option').forEach(function (option, index) {
      var input = option.querySelector('input');
      var rattle = rattleOptions[index];
      var key = rattle ? rattle.key : 'no';
      var label = rattle ? 'Rattle: ' + rattle.label : 'This rattle option';
      var isCheckoutable = isSelectionCheckoutable(selectedColorOption(), selectedWeightOption(), key);

      option.classList.toggle('active', selectedRattleKey() === key);
      option.classList.toggle('is-unavailable', !isCheckoutable);
      option.title = isCheckoutable ? label : unavailableTitle(label);

      if (input) {
        input.disabled = !isCheckoutable;
      }
    });
  }

  function updateOptionAvailability() {
    updateSwatchStates();
    updateWeightStates();
    updateRattleStates();
  }

  function renderSwatches() {
    if (!swatchesContainer) return;

    swatchesContainer.textContent = '';

    colorOptions.forEach(function (color, index) {
      var swatch = document.createElement('button');
      var swatchDot = document.createElement('span');
      var swatchName = document.createElement('span');

      swatch.type = 'button';
      swatch.className = 'swatch-button' + (index === selectedColor ? ' active' : '');
      swatch.setAttribute('aria-pressed', String(index === selectedColor));
      swatch.setAttribute('aria-label', color.name);
      swatch.title = color.name;
      swatch.style.setProperty('--swatch', color.swatch);

      swatchDot.className = 'swatch-dot';
      swatchName.className = 'swatch-name';
      swatchName.textContent = color.name;

      swatch.addEventListener('click', function () {
        setSelectedColor(index, true);
      });

      swatch.appendChild(swatchDot);
      swatch.appendChild(swatchName);
      swatchesContainer.appendChild(swatch);
    });
  }

  function updateColorDisplay() {
    var color = selectedColorOption();

    if (colorNameDisplay) colorNameDisplay.textContent = 'Selected color: ' + color.name;

    if (heroImg && color.image) {
      heroImg.src = imagePath(color.image);
      heroImg.alt = productName + ' in ' + color.name;
    }

    updatePrice();
  }

  function renderWeights() {
    var container = optionContainer(weightGroup);
    if (!container) return;

    container.textContent = '';

    weightOptions.forEach(function (weight, index) {
      var label = document.createElement('label');
      var input = document.createElement('input');
      var span = document.createElement('span');

      label.className = 'weight-option' + (index === selectedWeight ? ' active' : '');
      input.type = 'radio';
      input.name = 'weight';
      input.value = weight.key;
      input.checked = index === selectedWeight;
      span.className = 'weight-label';
      span.textContent = weight.label + ' oz';

      input.addEventListener('change', function () {
        selectedWeight = index;
        updateOptionAvailability();
        updatePrice();
      });

      label.appendChild(input);
      label.appendChild(span);
      container.appendChild(label);
    });
  }

  function renderRattleOptions() {
    if (!rattleGroup) return;

    var container = optionContainer(rattleGroup);

    if (!rattleAvailable) {
      if (container) container.textContent = '';
      rattleGroup.hidden = true;
      return;
    }

    if (!container) return;

    rattleGroup.hidden = false;
    container.textContent = '';

    rattleOptions.forEach(function (rattle) {
      var label = document.createElement('label');
      var input = document.createElement('input');
      var span = document.createElement('span');

      label.className = 'weight-option' + (rattle.key === defaultRattleKey ? ' active' : '');
      input.type = 'radio';
      input.name = 'rattle';
      input.value = rattle.key;
      input.checked = rattle.key === defaultRattleKey;
      span.className = 'weight-label';
      span.textContent = rattle.priceDelta
        ? rattle.label + ' (+ $' + rattle.priceDelta.toFixed(2) + ')'
        : rattle.label;

      input.addEventListener('change', function () {
        updateOptionAvailability();
        updatePrice();
      });

      label.appendChild(input);
      label.appendChild(span);
      container.appendChild(label);
    });
  }

  function updatePrice() {
    var build = selectedBuild();
    if (!build) return;

    if (priceDisplay) {
      priceDisplay.textContent = catalog ? catalog.formatMoney(build.price) : '$' + build.price.toFixed(2);
    }

    if (availabilityNode) {
      availabilityNode.textContent = build.isCheckoutable
        ? 'Available for secure online checkout.'
        : 'This option is not available for online checkout yet. Choose another option or contact us for availability.';
      availabilityNode.classList.toggle('is-unavailable', !build.isCheckoutable);
    }

    if (addCartBtn) {
      addCartBtn.disabled = !build.isCheckoutable;
      addCartBtn.textContent = build.isCheckoutable ? 'Add to Cart' : 'Unavailable Online';
    }
  }

  if (addCartBtn) {
    addCartBtn.addEventListener('click', function (event) {
      var build = selectedBuild();
      var added = null;
      var quantity = setProductQuantity(quantityInput ? quantityInput.value : 1);

      event.preventDefault();
      if (!build || !build.isCheckoutable) return;

      if (window.BassBingeCart && window.BassBingeCart.addJigBuild) {
        added = window.BassBingeCart.addJigBuild(build, quantity);
      } else if (typeof cart !== 'undefined' && cart.addItem) {
        cart.addItem(
          build.id,
          build.productTitle + ' - ' + build.colorName + ' / ' + build.weightLabel + ' oz',
          build.colorName,
          build.weightLabel,
          build.rattleKey,
          build.price,
          quantity,
          build.image ? imagePath(build.image) : (heroImg ? heroImg.src : '')
        );
        added = build;
      }

      if (added && window.BassBingeCart && window.BassBingeCart.showToast) {
        window.BassBingeCart.showToast(quantity + ' × ' + build.colorName + ' added to cart');
      }

      if (window.BassBingeCart && window.BassBingeCart.openCart) {
        window.BassBingeCart.openCart();
      }
    });
  }

  var galleryEl = document.querySelector('[data-gallery]');
  if (!galleryEl) {
    renderSwatches();
    renderWeights();
    renderRattleOptions();
    updateOptionAvailability();
    updateColorDisplay();
    return;
  }

  var track = galleryEl.querySelector('.product-gallery-track');
  var galleryMain = galleryEl.querySelector('.product-gallery-main');
  var thumbs = galleryEl.querySelector('.product-gallery-thumbs');
  var prevBtn = galleryEl.querySelector('.product-gallery-arrow.prev');
  var nextBtn = galleryEl.querySelector('.product-gallery-arrow.next');
  var counterEl = galleryEl.querySelector('.product-gallery-counter');
  var colorBadge = galleryMain ? galleryMain.querySelector('.product-gallery-color-name') : null;
  var admittedProduct = catalog.getAdmittedProduct && catalog.getAdmittedProduct(product.handle);
  var mediaGallery = window.BassBingeLimitedDropGallery;
  var admittedMedia = mediaGallery && admittedProduct
    ? mediaGallery.mediaItems(admittedProduct)
    : [];
  var images = admittedMedia.length ? admittedMedia.map(function (item) {
    return {
      id: item.id,
      type: item.type,
      src: item.src,
      sources: item.sources,
      alt: item.label,
      colorName: item.label,
      colorKey: null
    };
  }) : colorOptions.map(function (color) {
    return {
      type: 'image',
      src: imagePath(color.image),
      alt: productName + ' in ' + color.name,
      colorName: color.name,
      colorKey: color.key
    };
  });
  var totalImages = images.length;
  var currentSlide = galleryIndexForColor(selectedColor);
  var suppressZoomClick = false;
  var zoomToggle = null;
  var zoomModal = null;
  var zoomStage = null;
  var zoomImg = null;
  var zoomCaption = null;
  var zoomCounter = null;
  var zoomCloseBtn = null;
  var zoomPrevBtn = null;
  var zoomNextBtn = null;
  var zoomReturnFocus = null;
  var zoomTouchPointerId = null;
  var zoomTouchStartX = 0;
  var zoomTouchStartY = 0;
  var zoomTouchMoved = false;

  if (galleryEl) {
    galleryEl.setAttribute('tabindex', '0');
    galleryEl.setAttribute('aria-label', productName + ' media gallery');
  }

  if (!colorBadge && galleryMain) {
    colorBadge = document.createElement('span');
    colorBadge.className = 'product-gallery-color-name';
    galleryMain.appendChild(colorBadge);
  }

  function clampPercent(value) {
    return Math.max(0, Math.min(100, value));
  }

  function setNativeResolutionZoomScale(image, target, desiredScale) {
    var styles, horizontalPadding, verticalPadding, boxWidth, boxHeight;
    var sourceRatio, boxRatio, renderedWidth, renderedHeight, deviceScale, safeScale;

    if (!image || !target || !image.naturalWidth || !image.naturalHeight) return;

    styles = window.getComputedStyle ? window.getComputedStyle(image) : null;
    horizontalPadding = styles
      ? (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0)
      : 0;
    verticalPadding = styles
      ? (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0)
      : 0;
    boxWidth = Math.max(1, image.clientWidth - horizontalPadding);
    boxHeight = Math.max(1, image.clientHeight - verticalPadding);
    sourceRatio = image.naturalWidth / image.naturalHeight;
    boxRatio = boxWidth / boxHeight;

    if (sourceRatio > boxRatio) {
      renderedWidth = boxWidth;
      renderedHeight = boxWidth / sourceRatio;
    } else {
      renderedHeight = boxHeight;
      renderedWidth = boxHeight * sourceRatio;
    }

    deviceScale = Math.max(1, window.devicePixelRatio || 1);
    safeScale = Math.min(
      desiredScale,
      image.naturalWidth / (renderedWidth * deviceScale),
      image.naturalHeight / (renderedHeight * deviceScale)
    );
    target.style.setProperty('--zoom-scale', String(Math.max(1, safeScale)));
  }

  function updateNativeResolutionZoomScales() {
    setNativeResolutionZoomScale(activeGalleryImage(), galleryMain, 2.35);
    setNativeResolutionZoomScale(zoomImg, zoomStage, 2.55);
  }

  function setZoomPosition(event, image, target) {
    var rect, x, y;

    if (!event || !image || !target) return;

    rect = image.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    x = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
    y = clampPercent(((event.clientY - rect.top) / rect.height) * 100);

    target.style.setProperty('--zoom-x', x + '%');
    target.style.setProperty('--zoom-y', y + '%');
  }

  function activeGalleryImage() {
    var activeSlide = track ? track.querySelector('.product-gallery-slide.active') : null;
    return activeSlide ? activeSlide.querySelector('img') : null;
  }

  function galleryIndexForColor(index) {
    var color = colorOptions[index] || colorOptions[0];
    var colorImage = color && imagePath(color.image);
    var match = images && images.findIndex(function (item) {
      return item.colorKey === (color && color.key) ||
        (item.type === 'image' && item.src === colorImage);
    });
    return match >= 0 ? match : Math.max(0, Math.min(index, Math.max(totalImages - 1, 0)));
  }

  function resetInlineZoom() {
    if (!galleryMain) return;

    galleryMain.classList.remove('is-zooming');
    galleryMain.style.setProperty('--zoom-x', '50%');
    galleryMain.style.setProperty('--zoom-y', '50%');
  }

  function startInlineZoom(event) {
    if (
      !galleryMain ||
      !event ||
      !activeGalleryImage() ||
      (event.pointerType && event.pointerType === 'touch')
    ) return;

    galleryMain.classList.add('is-zooming');
    setZoomPosition(event, activeGalleryImage(), galleryMain);
  }

  function moveInlineZoom(event) {
    if (!galleryMain || !galleryMain.classList.contains('is-zooming')) return;
    if (event.pointerType && event.pointerType === 'touch') return;

    setZoomPosition(event, activeGalleryImage(), galleryMain);
  }

  function endInlineZoom(event) {
    if (event && event.pointerType && event.pointerType === 'touch') return;
    resetInlineZoom();
  }

  function resetModalZoom() {
    if (!zoomStage) return;

    zoomStage.classList.remove('is-zooming');
    zoomStage.classList.remove('is-zoom-locked');
    zoomStage.style.setProperty('--zoom-x', '50%');
    zoomStage.style.setProperty('--zoom-y', '50%');
    zoomTouchPointerId = null;
    zoomTouchStartX = 0;
    zoomTouchStartY = 0;
    zoomTouchMoved = false;
  }

  function updateZoomViewer() {
    var image = images[currentSlide];

    if (!zoomModal || zoomModal.hidden || !image) return;
    if (image.type !== 'image') {
      closeZoomViewer();
      return;
    }

    if (zoomImg) {
      zoomImg.src = image.src;
      zoomImg.alt = image.alt;
      if (zoomImg.complete) {
        window.requestAnimationFrame(updateNativeResolutionZoomScales);
      }
    }

    if (zoomCaption) zoomCaption.textContent = image.colorName;
    if (zoomCounter) zoomCounter.textContent = (currentSlide + 1) + ' / ' + totalImages;
    if (zoomPrevBtn) zoomPrevBtn.disabled = currentSlide === 0;
    if (zoomNextBtn) zoomNextBtn.disabled = currentSlide === totalImages - 1;

    resetModalZoom();
  }

  function closeZoomViewer() {
    if (!zoomModal || zoomModal.hidden) return;

    zoomModal.classList.remove('active');
    zoomModal.hidden = true;
    document.body.classList.remove('product-zoom-open');
    document.removeEventListener('keydown', zoomKeydownHandler);
    resetModalZoom();

    if (zoomReturnFocus && zoomReturnFocus.focus) {
      zoomReturnFocus.focus({ preventScroll: true });
    }
  }

  function zoomKeydownHandler(event) {
    if (!zoomModal || zoomModal.hidden) return;

    if (event.key === 'Escape') {
      closeZoomViewer();
      event.preventDefault();
    }

    if (event.key === 'ArrowLeft' && currentSlide > 0) {
      goPrev();
      event.preventDefault();
    }

    if (event.key === 'ArrowRight' && currentSlide < totalImages - 1) {
      goNext();
      event.preventDefault();
    }
  }

  function setModalZoomPosition(event) {
    setZoomPosition(event, zoomImg, zoomStage);
  }

  function isTouchZoomEvent(event) {
    return event && (event.pointerType === 'touch' || event.pointerType === 'pen');
  }

  function startModalZoom(event) {
    if (!zoomStage || !zoomImg) return;
    if (isTouchZoomEvent(event)) return;

    zoomStage.classList.add('is-zooming');
    setModalZoomPosition(event);
  }

  function startModalTouchTracking(event) {
    if (!isTouchZoomEvent(event) || !zoomStage || !zoomImg) return;
    if (zoomTouchPointerId !== null) return;

    zoomTouchPointerId = event.pointerId;
    zoomTouchStartX = event.clientX;
    zoomTouchStartY = event.clientY;
    zoomTouchMoved = false;

    if (zoomStage.setPointerCapture) {
      zoomStage.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
  }

  function moveModalZoom(event) {
    var deltaX, deltaY;

    if (!zoomStage || !zoomImg) return;

    if (isTouchZoomEvent(event)) {
      if (event.pointerId !== zoomTouchPointerId) return;

      deltaX = event.clientX - zoomTouchStartX;
      deltaY = event.clientY - zoomTouchStartY;
      if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
        zoomTouchMoved = true;
      }

      if (zoomStage.classList.contains('is-zoom-locked')) {
        setModalZoomPosition(event);
      }

      event.preventDefault();
      return;
    }

    if (!zoomStage.classList.contains('is-zooming')) return;

    setModalZoomPosition(event);
  }

  function endModalZoom(event) {
    if (!zoomStage) return;

    if (!isTouchZoomEvent(event)) {
      zoomStage.classList.remove('is-zooming');
      if (!zoomStage.classList.contains('is-zoom-locked')) {
        zoomStage.style.setProperty('--zoom-x', '50%');
        zoomStage.style.setProperty('--zoom-y', '50%');
      }
      return;
    }

    if (event.type !== 'pointerup' || event.pointerId !== zoomTouchPointerId) return;

    if (event && zoomStage && zoomStage.releasePointerCapture) {
      try {
        zoomStage.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Some browsers throw if pointer capture has already been released.
      }
    }

    if (!zoomTouchMoved) {
      if (zoomStage.classList.contains('is-zoom-locked')) {
        zoomStage.classList.remove('is-zoom-locked');
        zoomStage.style.setProperty('--zoom-x', '50%');
        zoomStage.style.setProperty('--zoom-y', '50%');
      } else {
        setModalZoomPosition(event);
        zoomStage.classList.add('is-zoom-locked');
      }
    }

    zoomTouchPointerId = null;
    zoomTouchStartX = 0;
    zoomTouchStartY = 0;
    zoomTouchMoved = false;
    event.preventDefault();
  }

  function cancelModalTouchTracking(event) {
    if (!isTouchZoomEvent(event) || event.pointerId !== zoomTouchPointerId) return;

    if (zoomStage && zoomStage.releasePointerCapture) {
      try {
        zoomStage.releasePointerCapture(event.pointerId);
      } catch (error) {
        // Some browsers throw if pointer capture has already been released.
      }
    }

    zoomTouchPointerId = null;
    zoomTouchStartX = 0;
    zoomTouchStartY = 0;
    zoomTouchMoved = false;
  }

  function ensureZoomViewer() {
    if (zoomModal) return;

    zoomModal = document.createElement('div');
    zoomModal.className = 'product-zoom-modal';
    zoomModal.hidden = true;
    zoomModal.setAttribute('role', 'dialog');
    zoomModal.setAttribute('aria-modal', 'true');
    zoomModal.setAttribute('aria-label', productName + ' enlarged product photo');
    zoomModal.innerHTML =
      '<div class="product-zoom-backdrop" data-product-zoom-close></div>' +
      '<div class="product-zoom-panel">' +
        '<button class="product-zoom-close" type="button" aria-label="Close product photo zoom">' +
          '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>' +
        '</button>' +
        '<button class="product-zoom-arrow prev" type="button" aria-label="Previous image">' +
          '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>' +
        '</button>' +
        '<div class="product-zoom-stage">' +
          '<img class="product-zoom-img" src="" alt="" draggable="false" />' +
        '</div>' +
        '<button class="product-zoom-arrow next" type="button" aria-label="Next image">' +
          '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>' +
        '</button>' +
        '<div class="product-zoom-meta">' +
          '<span class="product-zoom-caption"></span>' +
          '<span class="product-zoom-counter"></span>' +
        '</div>' +
      '</div>';

    document.body.appendChild(zoomModal);

    zoomStage = zoomModal.querySelector('.product-zoom-stage');
    zoomImg = zoomModal.querySelector('.product-zoom-img');
    zoomCaption = zoomModal.querySelector('.product-zoom-caption');
    zoomCounter = zoomModal.querySelector('.product-zoom-counter');
    zoomCloseBtn = zoomModal.querySelector('.product-zoom-close');
    zoomPrevBtn = zoomModal.querySelector('.product-zoom-arrow.prev');
    zoomNextBtn = zoomModal.querySelector('.product-zoom-arrow.next');

    if (zoomImg) zoomImg.addEventListener('load', updateNativeResolutionZoomScales);

    zoomModal.addEventListener('click', function (event) {
      if (event.target && event.target.hasAttribute('data-product-zoom-close')) {
        closeZoomViewer();
      }
    });

    if (zoomCloseBtn) zoomCloseBtn.addEventListener('click', closeZoomViewer);
    if (zoomPrevBtn) zoomPrevBtn.addEventListener('click', goPrev);
    if (zoomNextBtn) zoomNextBtn.addEventListener('click', goNext);

    if (zoomStage) {
      zoomStage.addEventListener('pointerenter', function (event) {
        if (!event.pointerType || event.pointerType !== 'touch') {
          startModalZoom(event);
        }
      });
      zoomStage.addEventListener('pointermove', moveModalZoom);
      zoomStage.addEventListener('pointerleave', function (event) {
        if (!event.pointerType || event.pointerType !== 'touch') {
          endModalZoom(event);
        }
      });
      zoomStage.addEventListener('pointerdown', startModalTouchTracking);
      zoomStage.addEventListener('pointerup', endModalZoom);
      zoomStage.addEventListener('pointercancel', cancelModalTouchTracking);
      zoomStage.addEventListener('contextmenu', function (event) {
        event.preventDefault();
      });
    }
  }

  function openZoomViewer() {
    if (!images[currentSlide] || images[currentSlide].type !== 'image') return;

    ensureZoomViewer();
    zoomReturnFocus = document.activeElement && document.activeElement.focus ? document.activeElement : null;
    zoomModal.hidden = false;
    document.body.classList.add('product-zoom-open');
    updateZoomViewer();
    window.requestAnimationFrame(function () {
      zoomModal.classList.add('active');
    });
    document.addEventListener('keydown', zoomKeydownHandler);

    if (zoomCloseBtn) {
      zoomCloseBtn.focus({ preventScroll: true });
    }
  }

  if (galleryMain) {
    galleryMain.style.setProperty('--zoom-x', '50%');
    galleryMain.style.setProperty('--zoom-y', '50%');

    zoomToggle = document.createElement('button');
    zoomToggle.type = 'button';
    zoomToggle.className = 'product-gallery-zoom-toggle';
    zoomToggle.setAttribute('aria-label', 'Open larger product photo');
    zoomToggle.innerHTML =
      '<svg aria-hidden="true" viewBox="0 0 24 24">' +
        '<circle cx="11" cy="11" r="6" />' +
        '<path d="m16 16 4 4" />' +
        '<path d="M11 8v6M8 11h6" />' +
      '</svg>';
    zoomToggle.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      openZoomViewer();
    });
    galleryMain.appendChild(zoomToggle);
  }

  function buildTrack() {
    if (!track) return;

    track.textContent = '';

    images.forEach(function (image, index) {
      var wrapper = document.createElement('div');
      var node;

      wrapper.className = 'product-gallery-slide' + (index === currentSlide ? ' active' : '');
      if (image.colorKey) wrapper.dataset.colorKey = image.colorKey;
      wrapper.setAttribute('role', 'group');
      wrapper.setAttribute('aria-label', image.colorName);
      wrapper.setAttribute('aria-hidden', String(index !== currentSlide));

      if (image.type === 'image') {
        node = document.createElement('img');
        node.src = image.src;
        node.alt = image.alt;
        node.draggable = false;
        node.decoding = 'async';
        if (index === currentSlide && 'fetchPriority' in node) {
          node.fetchPriority = 'high';
        }
        node.loading = index === currentSlide ? 'eager' : 'lazy';
        node.addEventListener('load', updateNativeResolutionZoomScales);
      } else if (image.type === 'video') {
        node = document.createElement('video');
        node.controls = true;
        node.playsInline = true;
        node.preload = 'metadata';
        node.setAttribute('aria-label', image.alt);
        (image.sources || []).forEach(function (source) {
          var sourceNode = document.createElement('source');
          sourceNode.src = source.url;
          if (source.mimeType) sourceNode.type = source.mimeType;
          node.appendChild(sourceNode);
        });
      } else if (image.type === 'external-video') {
        node = document.createElement('iframe');
        node.src = image.src;
        node.title = image.alt;
        node.loading = 'lazy';
        node.allow = 'autoplay; encrypted-media; picture-in-picture';
        node.allowFullscreen = true;
      } else if (image.type === 'model-3d') {
        node = document.createElement('a');
        node.className = 'generic-media-placeholder';
        node.href = image.src;
        node.textContent = 'View 3D model';
        node.setAttribute('aria-label', image.alt);
      } else {
        node = document.createElement('div');
        node.className = 'generic-media-placeholder';
        node.textContent = image.alt;
      }

      wrapper.appendChild(node);
      track.appendChild(wrapper);
    });
  }

  function buildThumbs() {
    if (!thumbs) return;

    thumbs.textContent = '';

    images.forEach(function (image, index) {
      var thumbBtn = document.createElement('button');
      var thumbVisual;
      var thumbName = document.createElement('span');

      thumbBtn.type = 'button';
      thumbBtn.className = 'product-gallery-thumb' + (index === currentSlide ? ' active' : '');
      thumbBtn.setAttribute('aria-label', 'View ' + image.colorName);
      thumbBtn.setAttribute('aria-pressed', String(index === currentSlide));
      if (image.colorKey) thumbBtn.dataset.colorKey = image.colorKey;

      if (image.type === 'image') {
        thumbVisual = document.createElement('img');
        thumbVisual.src = image.src;
        thumbVisual.alt = '';
        thumbVisual.draggable = false;
        thumbVisual.loading = 'lazy';
      } else {
        thumbVisual = document.createElement('span');
        thumbVisual.className = 'generic-media-thumb';
        thumbVisual.textContent = image.type === 'video' || image.type === 'external-video'
          ? '▶'
          : image.type === 'model-3d' ? '3D' : '—';
      }
      thumbName.className = 'product-gallery-thumb-name';
      thumbName.textContent = image.colorName;
      thumbBtn.appendChild(thumbVisual);
      thumbBtn.appendChild(thumbName);

      thumbBtn.addEventListener('click', function () {
        goToSlide(index);
      });

      thumbs.appendChild(thumbBtn);
    });
  }

  function updateGallery(index) {
    if (!track || totalImages < 1) return;

    index = Math.max(0, Math.min(index, totalImages - 1));
    currentSlide = index;
    resetInlineZoom();

    track.querySelectorAll('.product-gallery-slide').forEach(function (slide, slideIndex) {
      slide.classList.toggle('active', slideIndex === currentSlide);
      slide.setAttribute('aria-hidden', String(slideIndex !== currentSlide));
      if (slideIndex !== currentSlide) {
        var video = slide.querySelector('video');
        if (video) video.pause();
      }
    });

    if (counterEl) {
      counterEl.textContent = (currentSlide + 1) + ' / ' + totalImages;
    }

    if (colorBadge && images[currentSlide]) {
      colorBadge.textContent = images[currentSlide].colorName;
    }

    if (thumbs) {
      thumbs.querySelectorAll('.product-gallery-thumb').forEach(function (button, buttonIndex) {
        var isActive = buttonIndex === currentSlide;

        button.classList.toggle('active', buttonIndex === currentSlide);
        button.setAttribute('aria-pressed', String(isActive));

        if (isActive && button.scrollIntoView) {
          button.scrollIntoView({ block: 'nearest', inline: 'center' });
        }
      });
    }

    if (prevBtn) prevBtn.disabled = currentSlide === 0;
    if (nextBtn) nextBtn.disabled = currentSlide === totalImages - 1;
    if (zoomToggle) zoomToggle.hidden = images[currentSlide].type !== 'image';

    if (heroImg && images[currentSlide] && images[currentSlide].type === 'image') {
      heroImg.src = images[currentSlide].src;
      heroImg.alt = images[currentSlide].alt;
    }

    updateZoomViewer();
    updateNativeResolutionZoomScales();
  }

  function goToSlide(index) {
    var colorIndex;

    index = Math.max(0, Math.min(index, totalImages - 1));
    if (images[index] && images[index].colorKey) {
      colorIndex = colorOptions.findIndex(function (color) {
        return color.key === images[index].colorKey;
      });
      if (colorIndex >= 0) {
        selectedColor = colorIndex;
        updateColorDisplay();
        updateSwatchStates();
      }
    }
    updateGallery(index);
  }

  function goPrev() {
    if (currentSlide > 0) {
      goToSlide(currentSlide - 1);
    }
  }

  function goNext() {
    if (currentSlide < totalImages - 1) {
      goToSlide(currentSlide + 1);
    }
  }

  if (prevBtn) prevBtn.addEventListener('click', goPrev);
  if (nextBtn) nextBtn.addEventListener('click', goNext);

  var swipeThreshold = 50;
  var touchStartX = 0;
  var touchStartY = 0;
  var touchEndX = 0;
  var touchEndY = 0;
  var touchIsHorizontal = false;

  function resetTouchTracking() {
    touchStartX = 0;
    touchStartY = 0;
    touchEndX = 0;
    touchEndY = 0;
    touchIsHorizontal = false;
  }

  if (track && totalImages > 1) {
    track.addEventListener('touchstart', function (event) {
      if (!event.touches || !event.touches[0]) { return; }
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
      touchEndX = touchStartX;
      touchEndY = touchStartY;
      touchIsHorizontal = false;
    }, { passive: true });

    track.addEventListener('touchmove', function (event) {
      var deltaX, deltaY;

      if (!event.touches || !event.touches[0]) { return; }
      touchEndX = event.touches[0].clientX;
      touchEndY = event.touches[0].clientY;

      deltaX = touchEndX - touchStartX;
      deltaY = touchEndY - touchStartY;

      if (!touchIsHorizontal && Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
        touchIsHorizontal = true;
      }

      if (touchIsHorizontal) {
        event.preventDefault();
      }
    }, { passive: false });

    track.addEventListener('touchend', function (event) {
      var touch = event.changedTouches && event.changedTouches[0];
      var clientX, clientY;
      var deltaX, deltaY;

      // Use changedTouches if available, otherwise fall back to moved tracking
      if (touch) {
        clientX = touch.clientX;
        clientY = touch.clientY;
      } else {
        clientX = touchEndX;
        clientY = touchEndY;
      }

      deltaX = clientX - touchStartX;
      deltaY = clientY - touchStartY;

      if (Math.abs(deltaX) > swipeThreshold && Math.abs(deltaX) > Math.abs(deltaY)) {
        suppressZoomClick = true;
        if (deltaX < 0) goNext();
        else goPrev();
      } else if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
        suppressZoomClick = true;
      }

      resetTouchTracking();
    }, { passive: true });

    track.addEventListener('touchcancel', resetTouchTracking, { passive: true });
  }

  var mouseDown = false;
  var mouseStartX = 0;
  var mouseEndX = 0;

  function mouseDownHandler(event) {
    mouseDown = true;
    mouseStartX = event.clientX;
    mouseEndX = event.clientX;
    track.classList.add('dragging');
  }

  function mouseMoveHandler(event) {
    if (!mouseDown) return;
    mouseEndX = event.clientX;
  }

  function mouseUpHandler(event) {
    var delta;

    if (!mouseDown) return;
    mouseDown = false;
    track.classList.remove('dragging');
    if (totalImages <= 1) return;

    delta = mouseEndX - mouseStartX;
    if (Math.abs(delta) > 8) suppressZoomClick = true;

    if (Math.abs(delta) > swipeThreshold) {
      if (delta < 0) goNext();
      else goPrev();
    }
  }

  if (track && totalImages > 1) {
    track.addEventListener('mousedown', mouseDownHandler);
    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
  }

  if (track) {
    track.addEventListener('pointerenter', startInlineZoom);
    track.addEventListener('pointermove', moveInlineZoom);
    track.addEventListener('pointerleave', endInlineZoom);
    track.addEventListener('click', function (event) {
      if (event.target && event.target.closest && event.target.closest('video, iframe, a')) return;
      if (suppressZoomClick) {
        suppressZoomClick = false;
        return;
      }

      openZoomViewer();
    });
  }

  window.addEventListener('resize', function () {
    updateGallery(currentSlide);
  });

  galleryEl.addEventListener('keydown', function (event) {
    if (totalImages <= 1) return;
    if (event.key === 'ArrowLeft') {
      goPrev();
      event.preventDefault();
    }
    if (event.key === 'ArrowRight') {
      goNext();
      event.preventDefault();
    }
  });

  buildTrack();
  buildThumbs();
  renderSwatches();
  renderWeights();
  renderRattleOptions();
  updateGallery(currentSlide);
  updateOptionAvailability();
  updateColorDisplay();
  }

  Promise.resolve(catalog.ready).then(init);
})();
