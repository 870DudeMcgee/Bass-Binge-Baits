/*
 * Bass Binge Product Page — interactive color swatches, weight selectors, Add to Cart
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

  // ---- Init ----
  renderSwatches();
  renderWeights();
  updateColorDisplay();
  updatePrice();
})();
