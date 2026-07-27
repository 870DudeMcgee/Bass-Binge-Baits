(function (root) {
  'use strict';

  var catalog = root.BassBingeCatalog;
  if (!catalog) return;

  var store = catalog.store;
  var state = {
    items: loadCart(),
    reconciliationNotice: ''
  };
  var toastTimer = null;
  var checkoutPending = false;

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
        if (!item || !item.id || !item.productKey || item.quantity <= 0) return false;
        if (item.kind === 'shopify-variant') {
          return Boolean(
            item.checkoutMapping &&
            item.checkoutMapping.merchandiseId &&
            item.price &&
            item.price.amount !== undefined &&
            item.price.currencyCode
          );
        }
        return Boolean(item.colorKey && item.weightKey);
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

  function addExactVariant(line, quantity) {
    if (
      !line ||
      !line.isCheckoutable ||
      !line.id ||
      !line.productKey ||
      !line.checkoutMapping ||
      !line.checkoutMapping.merchandiseId ||
      !line.price ||
      line.price.amount === undefined ||
      !line.price.currencyCode
    ) return null;

    var qty = normalizeQuantity(quantity);
    var candidate = {
      kind: 'shopify-variant',
      id: line.id,
      productKey: line.productKey,
      productTitle: line.productTitle,
      selectedOptions: (line.selectedOptions || []).map(function (option) {
        return { name: option.name, value: option.value };
      }),
      price: {
        amount: String(line.price.amount),
        currencyCode: String(line.price.currencyCode)
      },
      image: line.image || null,
      checkoutMapping: {
        merchandiseId: line.checkoutMapping.merchandiseId,
        price: {
          amount: String(line.price.amount),
          currencyCode: String(line.price.currencyCode)
        }
      },
      quantity: qty,
      admittedGenerationId: catalog.status && catalog.status.generationId
    };
    var reconciled = catalog.reconcileExactCartLine
      ? catalog.reconcileExactCartLine(candidate)
      : { line: candidate, reason: null };
    if (!reconciled || !reconciled.line) return null;

    state.reconciliationNotice = '';
    var existing = state.items.find(function (item) {
      return item.kind === 'shopify-variant' && item.id === line.id;
    });
    if (existing) {
      var nextQuantity = Math.min(99, existing.quantity + qty);
      Object.keys(existing).forEach(function (key) {
        delete existing[key];
      });
      Object.assign(existing, reconciled.line, { quantity: nextQuantity });
    } else {
      state.items.push(reconciled.line);
    }
    saveCart();
    renderCart();
    return line;
  }

  function exactBuild(item) {
    if (!item || item.kind !== 'shopify-variant') return null;
    if (
      !catalog.status ||
      !catalog.status.generationId ||
      item.admittedGenerationId !== catalog.status.generationId
    ) return null;
    return {
      id: item.id,
      productKey: item.productKey,
      productTitle: item.productTitle,
      selectedOptions: item.selectedOptions || [],
      price: Number(item.price.amount),
      money: item.price,
      image: item.image,
      checkoutMapping: item.checkoutMapping,
      hasRattle: false,
      rattleMapping: null,
      isCheckoutable: true
    };
  }

  function getLines() {
    return state.items.map(function (item) {
      var build = exactBuild(item) || catalog.getJigBuild(item);
      if (!build) return null;

      return {
        id: item.id,
        quantity: item.quantity,
        build: build,
        lineTotal: build.price * item.quantity
      };
    }).filter(Boolean);
  }

  function reasonText(reason) {
    var labels = {
      'not-admitted': 'it is no longer offered',
      'sold-out': 'it sold out',
      'price-changed': 'its price changed',
      'currency-changed': 'its checkout currency changed',
      'options-changed': 'its Shopify options changed',
      'identity-changed': 'its Shopify identity changed',
      'catalog-unavailable': 'the current catalog could not be verified',
      'invalid-line': 'its saved details were incomplete'
    };
    return labels[reason] || 'its Shopify details changed';
  }

  function reconcilePersistedExactLines() {
    if (!catalog.status || !catalog.status.generationId || !catalog.reconcileExactCartLine) {
      return false;
    }
    var removedReasons = [];
    var changed = false;
    state.items = state.items.reduce(function (items, item) {
      if (!item || item.kind !== 'shopify-variant') {
        items.push(item);
        return items;
      }
      var result = catalog.reconcileExactCartLine(item);
      if (!result || !result.line) {
        removedReasons.push(result && result.reason);
        changed = true;
        return items;
      }
      items.push(result.line);
      changed = changed ||
        result.line.admittedGenerationId !== item.admittedGenerationId ||
        result.line.productTitle !== item.productTitle ||
        result.line.image !== item.image;
      return items;
    }, []);
    if (removedReasons.length) {
      var explanations = Array.from(new Set(removedReasons.map(reasonText)));
      state.reconciliationNotice = 'Your cart was updated. ' +
        removedReasons.length + ' item' + (removedReasons.length === 1 ? ' was' : 's were') +
        ' removed because ' + explanations.join(' or because ') + '.';
    }
    if (changed) saveCart();
    return changed;
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
      return mapping && (mapping.merchandiseId || mapping.id || mapping.variantId) ? true : null;
    });

    if (checkoutLines.some(function (line) { return !line; })) {
      return null;
    }

    return '#shopify-checkout';
  }

  function variantGid(mapping) {
    if (!mapping) return null;
    var id = mapping.merchandiseId || mapping.id;
    if (id && String(id).indexOf('gid://shopify/ProductVariant/') === 0) return String(id);
    var numeric = mapping.variantId || id;
    return numeric ? 'gid://shopify/ProductVariant/' + numeric : null;
  }

  function checkoutMoney(build) {
    var money = build && (build.money || (build.checkoutMapping && build.checkoutMapping.price));
    if (money && typeof money === 'object' && money.amount !== undefined && money.currencyCode) {
      return {
        amount: String(money.amount),
        currencyCode: String(money.currencyCode)
      };
    }
    var numeric = money === undefined || money === null ? build && build.price : money;
    return Number.isFinite(Number(numeric))
      ? { amount: Number(numeric).toFixed(2), currencyCode: 'USD' }
      : null;
  }

  function checkoutPayload(lines) {
    return lines.map(function (line) {
      return {
        merchandiseId: variantGid(line.build.checkoutMapping),
        price: checkoutMoney(line.build),
        rattleMerchandiseId: line.build.hasRattle
          ? variantGid(line.build.rattleMapping)
          : null,
        quantity: line.quantity,
        configurationId: line.id
      };
    });
  }

  async function beginCheckout() {
    reconcilePersistedExactLines();
    var lines = getLines();
    var checkoutLink = document.querySelector('[data-checkout-link]');
    var payload = checkoutPayload(lines);

    if (checkoutPending || !lines.length || payload.some(function (line) { return !line.merchandiseId; })) {
      return;
    }

    checkoutPending = true;
    if (checkoutLink) {
      checkoutLink.dataset.checkoutLabel = checkoutLink.textContent;
      checkoutLink.classList.add('disabled');
      checkoutLink.setAttribute('aria-busy', 'true');
      checkoutLink.textContent = 'Preparing Checkout…';
    }

    try {
      var response = await root.fetch('/api/shopify-cart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          generationId: catalog.status && catalog.status.generationId,
          lines: payload
        })
      });
      var result = await response.json();
      if (!response.ok || !result.ok || !result.checkoutUrl) {
        throw new Error(result.message || 'Shopify could not prepare checkout.');
      }

      try {
        root.localStorage.setItem(store.shopifyCartStorageKey, JSON.stringify({
          id: result.cartId,
          checkoutUrl: result.checkoutUrl,
          createdAt: new Date().toISOString()
        }));
      } catch (error) {
        // Checkout still works when localStorage is unavailable.
      }

      root.location.assign(result.checkoutUrl);
    } catch (error) {
      checkoutPending = false;
      if (checkoutLink) {
        checkoutLink.classList.remove('disabled');
        checkoutLink.removeAttribute('aria-busy');
        checkoutLink.textContent = checkoutLink.dataset.checkoutLabel || 'Continue to Checkout';
      }
      showToast(error.message || 'Secure checkout is temporarily unavailable.');
    }
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
    var metaParts = Array.isArray(line.build.selectedOptions)
      ? line.build.selectedOptions.map(function (option) {
          return option.name + ': ' + option.value;
        })
      : [line.build.colorName, line.build.weightLabel + ' oz'];
    var itemDescription = metaParts.filter(Boolean).join(' · ');

    itemNode.className = 'cart-item';
    itemNode.dataset.cartItemId = line.id;

    if (line.build.image) {
      image.src = catalog.assetPath(line.build.image);
      image.alt = line.build.productTitle + (itemDescription ? ' — ' + itemDescription : '');
    } else {
      image.hidden = true;
      image.alt = '';
    }
    image.loading = 'lazy';

    main.className = 'cart-item-main';
    top.className = 'cart-item-top';
    actions.className = 'cart-item-actions';
    stepper.className = 'quantity-stepper compact';
    stepper.setAttribute('aria-label', 'Quantity for ' + line.build.productTitle + (itemDescription ? ' — ' + itemDescription : ''));

    appendText(titleWrap, 'h3', line.build.productTitle);
    appendText(titleWrap, 'p', itemDescription);
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

    if (line.build.hasRattle && line.build.rattleMapping) {
      var child = document.createElement('div');
      var childLabel = document.createElement('span');
      var childPrice = document.createElement('strong');
      child.className = 'cart-item-child';
      childLabel.textContent = '↳ Rattle Add-on × ' + line.quantity;
      childPrice.textContent = catalog.formatMoney(
        Number(line.build.rattleMapping.price || 0) * line.quantity
      );
      child.appendChild(childLabel);
      child.appendChild(childPrice);
      main.appendChild(child);
    }

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
    var noticeNode = document.querySelector('[data-cart-reconciliation-notice]');

    if (!noticeNode && state.reconciliationNotice) {
      var drawerBody = document.querySelector('[data-cart-drawer] .cart-drawer-body');
      if (drawerBody) {
        noticeNode = document.createElement('p');
        noticeNode.className = 'cart-reconciliation-notice';
        noticeNode.dataset.cartReconciliationNotice = '';
        noticeNode.setAttribute('role', 'status');
        noticeNode.setAttribute('aria-live', 'polite');
        if (drawerBody.firstChild) {
          drawerBody.insertBefore(noticeNode, drawerBody.firstChild);
        } else {
          drawerBody.appendChild(noticeNode);
        }
      }
    }
    if (noticeNode) {
      noticeNode.textContent = state.reconciliationNotice;
      noticeNode.hidden = !state.reconciliationNotice;
    }

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
        event.preventDefault();
        if (link.getAttribute('aria-disabled') === 'true') {
          if (getCount() > 0) {
            showToast('Checkout needs Shopify mapping for every selected option.');
          }
          return;
        }

        beginCheckout();
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
    addExactVariant: addExactVariant,
    setQuantity: setQuantity,
    removeItem: removeItem,
    clear: clear,
    getLines: getLines,
    getCount: getCount,
    getSubtotal: getSubtotal,
    buildCheckoutUrl: buildCheckoutUrl,
    beginCheckout: beginCheckout,
    reconcilePersistedExactLines: reconcilePersistedExactLines,
    getReconciliationNotice: function () {
      return state.reconciliationNotice;
    },
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
  Promise.resolve(catalog.ready).then(function () {
    reconcilePersistedExactLines();
    renderCart();
  });
})(window);
