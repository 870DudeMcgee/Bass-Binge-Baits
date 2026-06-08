/*
 * Bass Binge Product Page — interactive color swatches, weight selectors, Add to Cart,
 * and swipeable product image gallery
 * Binds to .product-config element, populates swatches/weights dynamically
 */

(function () {
  var configEl = document.querySelector('.product-config');
  if (!configEl) return; // No product config found — not a product page

  var productId = configEl.dataset.productId;
  var productName = configEl.dataset.productName;
  var basePrice = parseFloat(configEl.dataset.basePrice);
  var colors = JSON.parse(configEl.dataset.colors);
  var colorImages = JSON.parse(configEl.dataset.colorImages);
  var defaultColor = parseInt(configEl.dataset.defaultColor);
  var weights = JSON.parse(configEl.dataset.weights);
  var defaultWeight = parseInt(configEl.dataset.defaultWeight);
  var rattleAvailable = configEl.dataset.rattle === 'true';

  var selectedColor = defaultColor;
  var selectedWeight = defaultWeight;

  // DOM elements
  var swatchesContainer = document.querySelector('.variant-swatches');
  var weightGroup = document.querySelector('[data-weight-group]');
  var rattleGroup = document.querySelector('[data-rattle-group]');
  var colorNameDisplay = document.querySelector('[data-color-name]');
  var priceDisplay = document.querySelector('[data-price-display]');
  var addCartBtn = document.querySelector('[data-add-cart]');
  var heroImg = document.querySelector('.product-hero-img');

  // ---- Render color swatches ----
  function renderSwatches() {
    if (!swatchesContainer) return;
    swatchesContainer.innerHTML = '';

    colors.forEach(function(colorName, i) {
      var hue = (i / colors.length) * 360;
      var swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'swatch-button' + (i === selectedColor ? ' active' : '');
      swatch.setAttribute('aria-pressed', String(i === selectedColor));
      swatch.setAttribute('aria-label', colorName);
      swatch.title = colorName;
      swatch.style.setProperty('--swatch', 'hsl(' + hue + ', 45%, 42%)');
      swatchesContainer.appendChild(swatch);

      swatch.addEventListener('click', function() {
        selectedColor = i;
        updateColorDisplay();
        updateGallery(selectedColor);
        // Update active class
        swatchesContainer.querySelectorAll('.swatch-button').forEach(function(s, j) {
          s.classList.toggle('active', j === i);
          s.setAttribute('aria-pressed', String(j === i));
        });
      });
    });
  }

  function updateColorDisplay() {
    var name = colors[selectedColor];
    if (colorNameDisplay) colorNameDisplay.textContent = name;

    // Update image if we have color-specific images
    if (heroImg && colorImages.length > 0) {
      var idx = Math.min(selectedColor, colorImages.length - 1);
      heroImg.src = colorImages[idx];
      heroImg.alt = productName + ' in ' + name;
    }

    // Update price if rattle changes total
    updatePrice();
  }

  // ---- Render weight selectors ----
  function renderWeights() {
    if (!weightGroup) return;
    weightGroup.innerHTML = '';

    weights.forEach(function(w, i) {
      var label = document.createElement('label');
      label.className = 'weight-option' + (i === selectedWeight ? ' active' : '');
      label.innerHTML = '<input type="radio" name="weight" value="' + i + '"' + (i === selectedWeight ? ' checked' : '') + ' /><span class="weight-label">' + w + ' oz</span>';
      weightGroup.appendChild(label);

      label.addEventListener('click', function() {
        selectedWeight = i;
        // Update active class
        weightGroup.querySelectorAll('.weight-option').forEach(function(w, j) {
          w.classList.toggle('active', j === i);
        });
        updatePrice();
      });
    });
  }

  // ---- Update price ----
  function updatePrice() {
    var price = basePrice;
    if (rattleAvailable) {
      var rattleChecked = document.querySelector('[name="rattle"]:checked');
      if (rattleChecked && rattleChecked.value === 'yes') price += 0.5;
    }
    if (priceDisplay) priceDisplay.textContent = '$' + price.toFixed(2);
  }

  // ---- Add to Cart ----
  if (addCartBtn) {
    addCartBtn.addEventListener('click', function(e) {
      e.preventDefault();

      var colorName = colors[selectedColor];
      var weightName = weights[selectedWeight];
      var price = basePrice;

      // Check rattle
      var rattleChecked = document.querySelector('[name="rattle"]:checked');
      if (rattleChecked && rattleChecked.value === 'yes') {
        price += 0.5;
      }

      var qty = 1;
      var qtyInput = document.querySelector('[data-qty]');
      if (qtyInput) qty = parseInt(qtyInput.value) || 1;

      var itemId = productId + '-' + selectedColor + '-' + selectedWeight;
      var itemFull = productName + ' — ' + colorName + ' / ' + weightName + ' oz';

      // Add to cart
      if (typeof cart !== 'undefined' && cart.addItem) {
        cart.addItem(itemId, itemFull, colorName, weightName,
          rattleChecked ? rattleChecked.value : 'No', price, qty,
          heroImg ? heroImg.src : '');
      }

      // Show toast
      var toast = document.querySelector('[data-toast]');
      if (toast) {
        toast.textContent = itemFull + ' added to cart';
        toast.classList.add('visible');
        setTimeout(function() { toast.classList.remove('visible'); }, 2500);
      }

      // Open cart drawer
      var drawer = document.querySelector('[data-cart-drawer]');
      var overlay = document.querySelector('[data-cart-overlay]');
      if (drawer) drawer.setAttribute('aria-hidden', 'false');
      if (overlay) overlay.removeAttribute('hidden');
    });
  }

  // ============================================================
  // Swipeable Product Gallery
  // ============================================================

  var galleryEl = document.querySelector('[data-gallery]');
  if (!galleryEl) return; // No gallery element — skip

  var track = galleryEl.querySelector('.product-gallery-track');
  var thumbs = galleryEl.querySelector('.product-gallery-thumbs');
  var prevBtn = galleryEl.querySelector('.product-gallery-arrow.prev');
  var nextBtn = galleryEl.querySelector('.product-gallery-arrow.next');
  var counterEl = galleryEl.querySelector('.product-gallery-counter');

  // Build gallery images from colorImages (one per color)
  var totalImages = colorImages.length; // effectively 6 for all products
  var currentSlide = defaultColor;
  var images = []; // { src, alt }
  for (var gi = 0; gi < colors.length; gi++) {
    var colorSrc = colorImages[gi];
    var colorAlt = productName + ' in ' + colors[gi];
    images.push({ src: colorSrc, alt: colorAlt });
  }

  // Build track slides
  function buildTrack() {
    track.innerHTML = '';
    for (var i = 0; i < images.length; i++) {
      (function(idx) {
        var wrapper = document.createElement('div');
        wrapper.className = 'product-gallery-slide';
        var img = document.createElement('img');
        img.src = images[idx].src;
        img.alt = images[idx].alt;
        img.draggable = false;
        img.loading = idx === currentSlide ? 'eager' : 'lazy';
        wrapper.appendChild(img);
        track.appendChild(wrapper);
      })(i);
    }
  }

  // Build thumbnails
  function buildThumbs() {
    thumbs.innerHTML = '';
    for (var i = 0; i < images.length; i++) {
      (function(idx) {
        var thumbBtn = document.createElement('button');
        thumbBtn.type = 'button';
        thumbBtn.className = 'product-gallery-thumb' + (idx === currentSlide ? ' active' : '');
        thumbBtn.setAttribute('aria-label', 'View ' + (idx + 1));
        thumbBtn.setAttribute('aria-pressed', String(idx === currentSlide));

        var thumbImg = document.createElement('img');
        thumbImg.src = images[idx].src;
        thumbImg.alt = 'Thumbnail for ' + colors[idx];
        thumbImg.draggable = false;
        thumbBtn.appendChild(thumbImg);

        thumbBtn.addEventListener('click', function() {
          goToSlide(idx);
        });

        thumbs.appendChild(thumbBtn);
      })(i);
    }
  }

  // Update position
  function updateGallery(index) {
    if (totalImages <= 1) return;
    index = Math.max(0, Math.min(index, totalImages - 1));
    currentSlide = index;

    // Update track position
    track.style.transform = 'translateX(-' + (currentSlide * 100) + '%)';
    track.style.webkitTransform = 'translateX(-' + (currentSlide * 100) + '%)';

    // Update counter
    if (counterEl) {
      counterEl.textContent = (currentSlide + 1) + ' / ' + totalImages;
    }

    // Update thumbnails
    var thumbBtns = thumbs.querySelectorAll('.product-gallery-thumb');
    thumbBtns.forEach(function(btn, j) {
      btn.classList.toggle('active', j === currentSlide);
      btn.setAttribute('aria-pressed', String(j === currentSlide));
    });

    // Update arrows visibility
    if (prevBtn) prevBtn.style.display = currentSlide === 0 ? 'none' : '';
    if (nextBtn) nextBtn.style.display = currentSlide === totalImages - 1 ? 'none' : '';

    // Update hero fallback image
    if (heroImg) {
      heroImg.src = images[currentSlide].src;
      heroImg.alt = images[currentSlide].alt;
    }
  }

  function goToSlide(index) {
    index = Math.max(0, Math.min(index, totalImages - 1));
    currentSlide = index;
    updateGallery(currentSlide);
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

  // ---- Touch/swipe support ----
  var touchStartX = 0;
  var touchStartY = 0;
  var touchEnded = false;
  var SWIPE_THRESHOLD = 50; // minimum px to count as swipe
  var isTouching = false;

  // Disable default swipe scrolling on gallery area
  var galleryMain = galleryEl.querySelector('.product-gallery-main');
  if (galleryMain) {
    galleryMain.addEventListener('touchstart', function(e) {
      if (totalImages <= 1) return;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      isTouching = true;
      touchEnded = false;
    }, { passive: false });

    galleryMain.addEventListener('touchmove', function(e) {
      if (totalImages <= 1 || !isTouching) return;
      // Prevent vertical page scroll during gallery swipe
      var deltaX = e.touches[0].clientX - touchStartX;
      var deltaY = e.touches[0].clientY - touchStartY;
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        e.preventDefault();
      }
    }, { passive: false });

    galleryMain.addEventListener('touchend', function(e) {
      if (totalImages <= 1 || touchEnded) return;
      touchEnded = true;
      isTouching = false;
      if (touchStartX === 0) return;
      var endX = changedTouchesFor(e)[0].clientX;
      var delta = endX - touchStartX;
      if (Math.abs(delta) > SWIPE_THRESHOLD) {
        if (delta < 0) goNext();   // swipe left = next
        else goPrev();              // swipe right = prev
      }
      touchStartX = 0;
    });

    galleryMain.addEventListener('touchstart', function() {
      // reset touch state
    });
  }

  function changedTouchesFor(e) {
    return e.changedTouches && e.changedTouches.length > 0 ? e.changedTouches : [e];
  }

  // ---- Mouse drag support for desktop ----
  var mouseDown = false;
  var mouseStartX = 0;
  var galleryMainEl = track || galleryEl;

  function mouseDownHandler(e) {
    mouseDown = true;
    mouseStartX = e.clientX;
    track.classList.add('dragging');
  }

  function mouseMoveHandler(e) {
    if (!mouseDown) return;
    // allow horizontal drag visual feedback if CSS supports it
  }

  function mouseUpHandler(e) {
    if (!mouseDown) return;
    mouseDown = false;
    track.classList.remove('dragging');
    if (totalImages <= 1) return;
    var delta = e.clientX - mouseStartX;
    if (Math.abs(delta) > SWIPE_THRESHOLD) {
      if (delta < 0) goNext();
      else goPrev();
    }
  }

  if (track && totalImages > 1) {
    track.addEventListener('mousedown', mouseDownHandler);
    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
  }

  // ---- Keyboard support ----
  galleryEl.addEventListener('keydown', function(e) {
    if (totalImages <= 1) return;
    if (e.key === 'ArrowLeft') { goPrev(); e.preventDefault(); }
    if (e.key === 'ArrowRight') { goNext(); e.preventDefault(); }
  });

  // ---- Init gallery ----
  buildTrack();
  buildThumbs();
  updateGallery(currentSlide);

  // ---- Init ----
  renderSwatches();
  renderWeights();
  updateColorDisplay();
  updatePrice();
})();
