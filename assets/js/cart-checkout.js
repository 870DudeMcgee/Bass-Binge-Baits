(function (root) {
  'use strict';

  var catalog = root.BassBingeCatalog;
  if (!catalog) return;

  var store = catalog.store;
  var state = {
    items: loadCart()
  };
  var toastTimer = null;

  function readJson(key) {
    try {
      var raw = root.localStorage && root.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function saveCart() {
    try {
      root.localStorage.setItem(store.cartStorageKey, JSON.stringify(state.items));
    } catch (error) {
      // localStorage may be unavailable in private browsing.
    }
  }

  function normalizeQuantity(quantity) {
    return Math.max(1, Math.min(99, Number(quantity) || 1));
  }

  function loadCart() {
    var saved = readJson(store.cartStorageKey);
    if (Array.isArray(saved)) {
      return saved.filter(function (item) {
        return item && item.id && item.productKey && item.colorKey && item.weightKey && item.quantity > 0;
      });
    }

    return migrateLegacyCarts();
  }

  function migrateLegacyCarts() {
    var migrated = [];
    var localCart = readJson('bassbinge-cart');
    var shopifyCart = readJson('bass-binge-cart-v1');

    if (Array.isArray(localCart)) {
      localCart.forEach(function (item) {
        var build = getBuildFromLegacyLocalLine(item);
        if (build) {
          upsertLine(migrated, build, item.qty || item.quantity || 1);
        }
      });
    }

    if (Array.isArray(shopifyCart)) {
      shopifyCart.forEach(function (item) {
        var build = getBuildFromLegacyShopifyLine(item);
        if (build) {
          upsertLine(migrated, build, item.quantity || item.qty || 1);
        }
      });
    }

    if (migrated.length) {
      try {
        root.localStorage.setItem(store.cartStorageKey, JSON.stringify(migrated));
      } catch (error) {
        // localStorage may be unavailable in private browsing.
      }
    }

    return migrated;
  }

  function getBuildFromLegacyLocalLine(item) {
    if (!item) return null;

    var product = null;
    var itemId = String(item.id || '');

    catalog.listProducts().some(function (candidate) {
      if (itemId.indexOf(candidate.legacyProductId + '-') === 0 || itemId === candidate.legacyProductId) {
        product = candidate;
        return true;
      }

      return false;
    });

    if (!product) {
      product = catalog.listProducts().find(function (candidate) {
        return item.name && String(item.name).toLowerCase().indexOf(candidate.title.toLowerCase()) >= 0;
      });
    }

    if (!product) return null;

    var color = catalog.getColorByName(product, item.color) || catalog.getColor(product, product.defaultColorKey);
    var weight = catalog.getWeight(product, item.weight) || catalog.getWeight(product, product.defaultWeightKey);
    var rattleKey = String(item.rattle || '').toLowerCase() === 'yes' ? 'yes' : 'no';

    return catalog.getJigBuild({
      productKey: product.key,
      colorKey: color && color.key,
      weightKey: weight && weight.key,
      rattleKey: rattleKey
    });
  }

  function getBuildFromLegacyShopifyLine(item) {
    if (!item || !item.variantId) return null;

    var match = catalog.findProductByVariantId(item.variantId);
    if (!match) return null;

    return catalog.getJigBuild({
      productKey: match.product.key,
      colorKey: match.color.key,
      weightKey: match.product.defaultWeightKey,
      rattleKey: 'no'
    });
  }

  function upsertLine(items, build, quantity) {
    var qty = normalizeQuantity(quantity);
    var existing = items.find(function (item) {
      return item.id === build.id;
    });

    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + qty);
    } else {
      items.push({
        id: build.id,
        productKey: build.productKey,
        colorKey: build.colorKey,
        weightKey: build.weightKey,
        rattleKey: build.rattleKey,
        quantity: qty
      });
    }
  }

  function getLines() {
    return state.items.map(function (item) {
      var build = catalog.getJigBuild(item);
      if (!build) return null;

      return {
        id: item.id,
        quantity: item.quantity,
        build: build,
        lineTotal: build.price * item.quantity
      };
    }).filter(Boolean);
  }

  function getCount() {
    return state.items.reduce(function (total, item) {
      return total + item.quantity;
    }, 0);
  }

  function getSubtotal() {
    return getLines().reduce(function (total, line) {
      return total + line.lineTotal;
    }, 0);
  }

  function addJigBuild(selection, quantity) {
    var build = catalog.getJigBuild(selection);
    if (!build) return null;

    upsertLine(state.items, build, quantity);
    saveCart();
    renderCart();
    return build;
  }

  function setQuantity(id, quantity) {
    var qty = Number(quantity) || 0;

    state.items = state.items.filter(function (item) {
      if (item.id !== id) return true;

      if (qty <= 0) return false;

      item.quantity = Math.min(99, qty);
      return true;
    });

    saveCart();
    renderCart();
  }

  function removeItem(id) {
    setQuantity(id, 0);
  }

  function clear() {
    state.items = [];
    saveCart();
    renderCart();
  }

  function buildCheckoutUrl(lines) {
    var cartLines = lines || getLines();
    if (!cartLines.length) {
      return null;
    }

    var checkoutLines = cartLines.map(function (line) {
      var mapping = line.build.checkoutMapping;
      return mapping && mapping.variantId ? mapping.variantId + ':' + line.quantity : null;
    });

    if (checkoutLines.some(function (line) { return !line; })) {
      return null;
    }

    return 'https://' + store.domain + '/cart/' + checkoutLines.join(',');
  }

  function updateBadges() {
    var count = getCount();
    var label = count + ' item' + (count === 1 ? '' : 's');

    document.querySelectorAll('[data-cart-count]').forEach(function (node) {
      node.textContent = String(count);
      node.classList.toggle('has-items', count > 0);
    });

    document.querySelectorAll('[data-cart-summary-count]').forEach(function (node) {
      node.textContent = label;
    });
  }

  function appendText(parent, tagName, text) {
    var node = document.createElement(tagName);
    node.textContent = text;
    parent.appendChild(node);
    return node;
  }

  function renderCartItem(cartItemsNode, line) {
    var itemNode = document.createElement('article');
    var image = document.createElement('img');
    var main = document.createElement('div');
    var top = document.createElement('div');
    var titleWrap = document.createElement('div');
    var actions = document.createElement('div');
    var stepper = document.createElement('div');
    var decrease = document.createElement('button');
    var quantity = document.createElement('span');
    var increase = document.createElement('button');
    var remove = document.createElement('button');
    var price = document.createElement('strong');
    var metaParts = [line.build.colorName, line.build.weightLabel + ' oz'];

    if (line.build.hasRattle) {
      metaParts.push('w/ rattle');
    }

    itemNode.className = 'cart-item';
    itemNode.dataset.cartItemId = line.id;

    image.src = catalog.assetPath(line.build.image);
    image.alt = line.build.productTitle + ' in ' + line.build.colorName;
    image.loading = 'lazy';

    main.className = 'cart-item-main';
    top.className = 'cart-item-top';
    actions.className = 'cart-item-actions';
    stepper.className = 'quantity-stepper compact';
    stepper.setAttribute('aria-label', 'Quantity for ' + line.build.productTitle + ' in ' + line.build.colorName);

    appendText(titleWrap, 'h3', line.build.productTitle);
    appendText(titleWrap, 'p', metaParts.join(' · '));
    price.textContent = catalog.formatMoney(line.lineTotal);

    decrease.type = 'button';
    decrease.textContent = '-';
    decrease.setAttribute('aria-label', 'Decrease quantity');
    decrease.addEventListener('click', function () {
      setQuantity(line.id, line.quantity - 1);
    });

    quantity.textContent = String(line.quantity);

    increase.type = 'button';
    increase.textContent = '+';
    increase.setAttribute('aria-label', 'Increase quantity');
    increase.addEventListener('click', function () {
      setQuantity(line.id, line.quantity + 1);
    });

    remove.type = 'button';
    remove.className = 'text-button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', function () {
      removeItem(line.id);
    });

    stepper.appendChild(decrease);
    stepper.appendChild(quantity);
    stepper.appendChild(increase);
    actions.appendChild(stepper);
    actions.appendChild(remove);
    top.appendChild(titleWrap);
    top.appendChild(price);
    main.appendChild(top);
    main.appendChild(actions);
    itemNode.appendChild(image);
    itemNode.appendChild(main);
    cartItemsNode.appendChild(itemNode);
  }

  function renderCart() {
    var lines = getLines();
    var count = getCount();
    var isEmpty = count === 0;
    var checkoutUrl = buildCheckoutUrl(lines);
    var cartItemsNode = document.querySelector('[data-cart-items]');
    var cartEmptyNode = document.querySelector('[data-cart-empty]');
    var subtotalNode = document.querySelector('[data-cart-subtotal]');
    var checkoutLink = document.querySelector('[data-checkout-link]');

    updateBadges();

    if (cartItemsNode) {
      cartItemsNode.textContent = '';
      cartItemsNode.hidden = isEmpty;
      lines.forEach(function (line) {
        renderCartItem(cartItemsNode, line);
      });
    }

    if (cartEmptyNode) {
      cartEmptyNode.hidden = !isEmpty;
    }

    if (subtotalNode) {
      subtotalNode.textContent = catalog.formatMoney(getSubtotal());
    }

    if (checkoutLink) {
      checkoutLink.href = checkoutUrl || '#';
      checkoutLink.setAttribute('aria-disabled', String(!checkoutUrl));
      checkoutLink.classList.toggle('disabled', !checkoutUrl);
      checkoutLink.title = !isEmpty && !checkoutUrl
        ? 'One or more selections need Shopify variant mapping before checkout.'
        : '';
    }
  }

  function openCart() {
    var drawer = document.querySelector('[data-cart-drawer]');
    var overlay = document.querySelector('[data-cart-overlay]');

    if (drawer) {
      drawer.setAttribute('aria-hidden', 'false');
      setTimeout(function () {
        var closeButton = drawer.querySelector('[data-cart-close]');
        if (closeButton) closeButton.focus();
      }, 50);
    }

    if (overlay) overlay.hidden = false;
    document.body.classList.add('cart-open');
  }

  function closeCart() {
    var drawer = document.querySelector('[data-cart-drawer]');
    var overlay = document.querySelector('[data-cart-overlay]');

    if (drawer) drawer.setAttribute('aria-hidden', 'true');
    if (overlay) overlay.hidden = true;
    document.body.classList.remove('cart-open');
  }

  function showToast(message) {
    var toast = document.querySelector('[data-toast]');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('visible');
    }, 2600);
  }

  function bindCartChrome() {
    document.querySelectorAll('[data-cart-open]').forEach(function (button) {
      button.addEventListener('click', openCart);
    });

    document.querySelectorAll('[data-cart-close]').forEach(function (button) {
      button.addEventListener('click', closeCart);
    });

    var overlay = document.querySelector('[data-cart-overlay]');
    if (overlay) {
      overlay.addEventListener('click', closeCart);
    }

    document.querySelectorAll('[data-checkout-link]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        if (link.getAttribute('aria-disabled') === 'true') {
          event.preventDefault();
          if (getCount() > 0) {
            showToast('Checkout needs Shopify mapping for every selected option.');
          }
        }
      });
    });

    document.addEventListener('keydown', function (event) {
      var drawer = document.querySelector('[data-cart-drawer]');
      if (event.key === 'Escape' && drawer && drawer.getAttribute('aria-hidden') === 'false') {
        closeCart();
      }
    });
  }

  root.BassBingeCart = {
    addJigBuild: addJigBuild,
    setQuantity: setQuantity,
    removeItem: removeItem,
    clear: clear,
    getLines: getLines,
    getCount: getCount,
    getSubtotal: getSubtotal,
    buildCheckoutUrl: buildCheckoutUrl,
    renderCart: renderCart,
    openCart: openCart,
    closeCart: closeCart,
    showToast: showToast
  };

  root.cart = {
    addItem: function (id, name, colorName, weightLabel, rattle, price, qty) {
      var build = getBuildFromLegacyLocalLine({
        id: id,
        name: name,
        color: colorName,
        weight: weightLabel,
        rattle: rattle,
        price: price,
        qty: qty
      });

      if (build) {
        addJigBuild(build, qty);
      }
    },
    removeItem: removeItem,
    updateQty: setQuantity,
    clear: clear,
    load: function () {
      renderCart();
      return this;
    }
  };

  bindCartChrome();
  renderCart();
})(window);
