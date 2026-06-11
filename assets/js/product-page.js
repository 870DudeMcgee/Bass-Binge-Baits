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
  var productKey = configEl.dataset.productKey || configEl.dataset.productId;
  var product = catalog && catalog.getProduct(productKey);
  var usingCatalog = Boolean(catalog && product);
  var productName = usingCatalog ? product.title : configEl.dataset.productName;
  var basePrice = usingCatalog ? product.basePrice : parseFloat(configEl.dataset.basePrice);
  var colorOptions = usingCatalog ? product.colors : legacyColors();
  var weightOptions = usingCatalog ? product.weights : legacyWeights();
  var rattleAvailable = usingCatalog ? product.rattle.available : configEl.dataset.rattle === 'true';
  var rattleOptions = usingCatalog ? catalog.getRattleOptions(product) : legacyRattleOptions();
  var defaultRattleKey = usingCatalog ? product.rattle.defaultKey : 'no';
  var selectedColor = usingCatalog ? indexForKey(colorOptions, product.defaultColorKey) : parseInt(configEl.dataset.defaultColor, 10);
  var selectedWeight = usingCatalog ? indexForKey(weightOptions, product.defaultWeightKey) : parseInt(configEl.dataset.defaultWeight, 10);

  if (selectedColor < 0 || Number.isNaN(selectedColor)) selectedColor = 0;
  if (selectedWeight < 0 || Number.isNaN(selectedWeight)) selectedWeight = 0;

  var swatchesContainer = document.querySelector('.variant-swatches');
  var weightGroup = document.querySelector('[data-weight-group]');
  var rattleGroup = document.querySelector('[data-rattle-group]');
  var colorNameDisplay = document.querySelector('[data-color-name]');
  var priceDisplay = document.querySelector('[data-price-display]');
  var addCartBtn = document.querySelector('[data-add-cart]');
  var heroImg = document.querySelector('.product-hero-img');

  function legacyColors() {
    var names = parseDatasetJson('colors', []);
    var images = parseDatasetJson('colorImages', []);

    return names.map(function (name, index) {
      return {
        key: String(index),
        name: name,
        swatch: 'hsl(' + ((index / Math.max(names.length, 1)) * 360) + ', 45%, 42%)',
        image: images[index] || images[0] || ''
      };
    });
  }

  function legacyWeights() {
    return parseDatasetJson('weights', []).map(function (label, index) {
      return {
        key: String(index),
        label: label,
        priceDelta: 0
      };
    });
  }

  function legacyRattleOptions() {
    return [
      { key: 'no', label: 'No', priceDelta: 0 },
      { key: 'yes', label: 'Yes', priceDelta: 0.5 }
    ];
  }

  function parseDatasetJson(key, fallback) {
    try {
      return JSON.parse(configEl.dataset[key]) || fallback;
    } catch (error) {
      return fallback;
    }
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

  function selectedBuild() {
    var color = selectedColorOption();
    var weight = selectedWeightOption();
    var rattle = selectedRattleOption();

    if (usingCatalog) {
      return catalog.getJigBuild({
        productKey: product.key,
        colorKey: color.key,
        weightKey: weight.key,
        rattleKey: rattle.key
      });
    }

    return {
      id: [productKey, color.key, weight.key, rattle.key].join(':'),
      productKey: productKey,
      productTitle: productName,
      colorKey: color.key,
      colorName: color.name,
      weightKey: weight.key,
      weightLabel: weight.label,
      rattleKey: rattle.key,
      rattleLabel: rattle.label,
      hasRattle: rattle.key === 'yes',
      price: basePrice + (rattle.priceDelta || 0),
      image: color.image
    };
  }

  function setSelectedColor(index, shouldSyncGallery) {
    selectedColor = Math.max(0, Math.min(index, colorOptions.length - 1));
    updateColorDisplay();
    updateSwatchStates();

    if (shouldSyncGallery) {
      updateGallery(selectedColor);
    }
  }

  function updateSwatchStates() {
    if (!swatchesContainer) return;

    swatchesContainer.querySelectorAll('.swatch-button').forEach(function (swatch, index) {
      swatch.classList.toggle('active', index === selectedColor);
      swatch.setAttribute('aria-pressed', String(index === selectedColor));
    });
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
        container.querySelectorAll('.weight-option').forEach(function (option, optionIndex) {
          option.classList.toggle('active', optionIndex === index);
        });
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
        container.querySelectorAll('.weight-option').forEach(function (option) {
          option.classList.remove('active');
        });
        label.classList.add('active');
        updatePrice();
      });

      label.appendChild(input);
      label.appendChild(span);
      container.appendChild(label);
    });
  }

  function updatePrice() {
    var build = selectedBuild();
    if (!build || !priceDisplay) return;

    priceDisplay.textContent = catalog ? catalog.formatMoney(build.price) : '$' + build.price.toFixed(2);
  }

  if (addCartBtn) {
    addCartBtn.addEventListener('click', function (event) {
      var build = selectedBuild();
      var added = null;

      event.preventDefault();
      if (!build) return;

      if (window.BassBingeCart && window.BassBingeCart.addJigBuild) {
        added = window.BassBingeCart.addJigBuild(build, 1);
      } else if (typeof cart !== 'undefined' && cart.addItem) {
        cart.addItem(
          build.id,
          build.productTitle + ' - ' + build.colorName + ' / ' + build.weightLabel + ' oz',
          build.colorName,
          build.weightLabel,
          build.rattleKey,
          build.price,
          1,
          build.image ? imagePath(build.image) : (heroImg ? heroImg.src : '')
        );
        added = build;
      }

      if (added && window.BassBingeCart && window.BassBingeCart.showToast) {
        window.BassBingeCart.showToast(build.colorName + ' added to cart');
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
  var images = colorOptions.map(function (color) {
    return {
      src: imagePath(color.image),
      alt: productName + ' in ' + color.name,
      colorName: color.name,
      colorKey: color.key
    };
  });
  var totalImages = images.length;
  var currentSlide = selectedColor;

  if (galleryEl) {
    galleryEl.setAttribute('tabindex', '0');
    galleryEl.setAttribute('aria-label', productName + ' image gallery');
  }

  if (!colorBadge && galleryMain) {
    colorBadge = document.createElement('span');
    colorBadge.className = 'product-gallery-color-name';
    galleryMain.appendChild(colorBadge);
  }

  function buildTrack() {
    if (!track) return;

    track.textContent = '';

    images.forEach(function (image, index) {
      var wrapper = document.createElement('div');
      var img = document.createElement('img');

      wrapper.className = 'product-gallery-slide' + (index === currentSlide ? ' active' : '');
      wrapper.dataset.colorKey = image.colorKey;
      wrapper.setAttribute('role', 'group');
      wrapper.setAttribute('aria-label', image.colorName);
      wrapper.setAttribute('aria-hidden', String(index !== currentSlide));
      img.src = image.src;
      img.alt = image.alt;
      img.draggable = false;
      img.decoding = 'async';
      if (index === currentSlide && 'fetchPriority' in img) {
        img.fetchPriority = 'high';
      }
      img.loading = index === currentSlide ? 'eager' : 'lazy';
      wrapper.appendChild(img);
      track.appendChild(wrapper);
    });
  }

  function buildThumbs() {
    if (!thumbs) return;

    thumbs.textContent = '';

    images.forEach(function (image, index) {
      var thumbBtn = document.createElement('button');
      var thumbImg = document.createElement('img');
      var thumbName = document.createElement('span');

      thumbBtn.type = 'button';
      thumbBtn.className = 'product-gallery-thumb' + (index === currentSlide ? ' active' : '');
      thumbBtn.setAttribute('aria-label', 'View ' + image.colorName);
      thumbBtn.setAttribute('aria-pressed', String(index === currentSlide));
      thumbBtn.dataset.colorKey = image.colorKey;

      thumbImg.src = image.src;
      thumbImg.alt = 'Thumbnail for ' + image.colorName;
      thumbImg.draggable = false;
      thumbImg.loading = 'lazy';
      thumbName.className = 'product-gallery-thumb-name';
      thumbName.textContent = image.colorName;
      thumbBtn.appendChild(thumbImg);
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

    track.querySelectorAll('.product-gallery-slide').forEach(function (slide, slideIndex) {
      slide.classList.toggle('active', slideIndex === currentSlide);
      slide.setAttribute('aria-hidden', String(slideIndex !== currentSlide));
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

    if (heroImg && images[currentSlide]) {
      heroImg.src = images[currentSlide].src;
      heroImg.alt = images[currentSlide].alt;
    }
  }

  function goToSlide(index) {
    index = Math.max(0, Math.min(index, totalImages - 1));
    selectedColor = index;
    updateColorDisplay();
    updateSwatchStates();
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
        if (deltaX < 0) goNext();
        else goPrev();
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
  updateColorDisplay();
})();
