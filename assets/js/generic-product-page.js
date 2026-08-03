(function (root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.BassBingeGenericProduct = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function selectionForVariant(variant) {
    return (variant && Array.isArray(variant.selectedOptions) ? variant.selectedOptions : [])
      .reduce(function (selection, option) {
        selection[option.name] = option.value;
        return selection;
      }, {});
  }

  function initialSelection(product) {
    var variants = product && Array.isArray(product.variants) ? product.variants : [];
    return selectionForVariant(variants.find(function (variant) {
      return variant.availableForSale;
    }) || variants[0]);
  }

  function resolveVariant(product, selection) {
    var names = (product && Array.isArray(product.options) ? product.options : [])
      .map(function (option) { return option.name; });
    var variants = product && Array.isArray(product.variants) ? product.variants : [];

    return variants.find(function (variant) {
      var selected = selectionForVariant(variant);
      return names.length === Object.keys(selection || {}).length &&
        names.every(function (name) { return selected[name] === selection[name]; });
    }) || null;
  }

  function selectionForIntent(product, intent) {
    var variants = product && Array.isArray(product.variants) ? product.variants : [];
    var names = Object.keys(intent || {});
    var variant = variants.find(function (candidate) {
      var selected = selectionForVariant(candidate);
      return candidate.availableForSale && names.every(function (name) {
        return selected[name] === intent[name];
      });
    });
    return variant ? selectionForVariant(variant) : null;
  }

  function optionValueState(product, selection, optionName, value) {
    var variants = product && Array.isArray(product.variants) ? product.variants : [];
    var matches = variants.filter(function (variant) {
      var selected = selectionForVariant(variant);
      return selected[optionName] === value;
    });
    return {
      exists: matches.length > 0,
      available: matches.some(function (variant) { return variant.availableForSale; })
    };
  }

  function mediaMatchesVariant(media, variant) {
    if (!media || !variant) return false;
    if (variant.imageId && (
      media.id === variant.imageId ||
      media.image && media.image.id === variant.imageId
    )) return true;
    return Boolean(
      variant.image && variant.image.url &&
      media.image && media.image.url === variant.image.url
    );
  }

  function orderedMedia(product, variant) {
    var media = product && Array.isArray(product.media) ? product.media.slice() : [];
    var lead = media.findIndex(function (item) {
      return mediaMatchesVariant(item, variant);
    });
    if (lead > 0) media.unshift(media.splice(lead, 1)[0]);
    return media;
  }

  function variantImage(product, variant) {
    if (variant && variant.image && variant.image.url) return variant.image.url;
    var image = orderedMedia(product, variant).find(function (item) {
      return item && item.type === 'image' && item.image && item.image.url;
    });
    return image ? image.image.url : null;
  }

  function buildCartLine(product, variant) {
    if (!product || !variant || !variant.availableForSale || !variant.id || !variant.price) {
      return null;
    }
    var price = {
      amount: String(variant.price.amount),
      currencyCode: String(variant.price.currencyCode)
    };
    return {
      id: variant.id,
      productKey: product.handle,
      productTitle: product.title,
      selectedOptions: (variant.selectedOptions || []).map(function (option) {
        return { name: option.name, value: option.value };
      }),
      price: price,
      image: variantImage(product, variant),
      checkoutMapping: {
        merchandiseId: variant.id,
        price: price
      },
      isCheckoutable: true
    };
  }

  function formatMoney(money) {
    if (!money) return '';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: money.currencyCode
      }).format(Number(money.amount));
    } catch (error) {
      return '$' + Number(money.amount).toFixed(2);
    }
  }

  function mount(product, cart) {
    if (typeof document === 'undefined' || !product) return null;

    var main = document.querySelector('.product-page');
    var optionsRoot = document.querySelector('[data-generic-options]');
    var track = document.querySelector('[data-gallery-track]');
    var thumbs = document.querySelector('[data-gallery-thumbs]');
    var previous = document.querySelector('[data-gallery-prev]');
    var next = document.querySelector('[data-gallery-next]');
    var counter = document.querySelector('[data-gallery-counter]');
    var price = document.querySelector('[data-price-display]');
    var availability = document.querySelector('[data-product-availability]');
    var addButton = document.querySelector('[data-add-cart]');
    var quantityInput = document.querySelector('[data-quantity-input]');
    var quantityDecrease = document.querySelector('[data-quantity-decrease]');
    var quantityIncrease = document.querySelector('[data-quantity-increase]');
    var selection = initialSelection(product);
    var intent = {};
    var media = [];
    var mediaIndex = 0;

    function quantity(value) {
      var parsed = parseInt(value, 10);
      if (!Number.isFinite(parsed)) parsed = 1;
      return Math.max(1, Math.min(99, parsed));
    }

    function setQuantity(value) {
      var nextQuantity = quantity(value);
      if (quantityInput) quantityInput.value = String(nextQuantity);
      return nextQuantity;
    }

    function currentVariant() {
      return resolveVariant(product, selection);
    }

    function showMedia(index) {
      mediaIndex = Math.max(0, Math.min(index, Math.max(media.length - 1, 0)));
      if (track) Array.from(track.children).forEach(function (slide, slideIndex) {
        slide.classList.toggle('active', slideIndex === mediaIndex);
        slide.hidden = slideIndex !== mediaIndex;
      });
      if (thumbs) Array.from(thumbs.children).forEach(function (thumb, thumbIndex) {
        thumb.classList.toggle('active', thumbIndex === mediaIndex);
        thumb.setAttribute('aria-pressed', String(thumbIndex === mediaIndex));
      });
      if (counter) counter.textContent = media.length
        ? (mediaIndex + 1) + ' / ' + media.length
        : 'No image';
      if (previous) previous.disabled = mediaIndex === 0;
      if (next) next.disabled = mediaIndex >= media.length - 1;
    }

    function appendMedia(slide, item) {
      var node;
      var label = item && item.alt || product.title;
      if (item && item.type === 'image' && item.image && item.image.url) {
        node = document.createElement('img');
        node.src = item.image.url;
        node.alt = label;
        node.loading = 'eager';
      } else {
        node = document.createElement('div');
        node.className = 'generic-media-placeholder';
        node.textContent = label + ' media unavailable';
      }
      slide.appendChild(node);
    }

    function renderGallery(variant) {
      media = orderedMedia(product, variant);
      if (track) track.textContent = '';
      if (thumbs) thumbs.textContent = '';
      media.forEach(function (item, index) {
        var slide = document.createElement('div');
        var thumb = document.createElement('button');
        var image = document.createElement('img');
        slide.className = 'product-gallery-slide';
        appendMedia(slide, item);
        thumb.type = 'button';
        thumb.className = 'product-gallery-thumb';
        thumb.setAttribute('aria-label', 'View ' + product.title + ' image ' + (index + 1));
        image.src = item.image && item.image.url || '';
        image.alt = '';
        thumb.appendChild(image);
        thumb.addEventListener('click', function () { showMedia(index); });
        if (track) track.appendChild(slide);
        if (thumbs) thumbs.appendChild(thumb);
      });
      showMedia(0);
    }

    function renderOptions() {
      if (!optionsRoot) return;
      optionsRoot.textContent = '';
      (product.options || []).forEach(function (option) {
        var fieldset = document.createElement('fieldset');
        var legend = document.createElement('legend');
        var values = document.createElement('div');
        fieldset.className = 'product-config-selector generic-option-group';
        legend.className = 'config-label';
        legend.textContent = option.name + ':';
        values.className = 'weight-options';
        (option.values || []).forEach(function (value) {
          var state = optionValueState(product, selection, option.name, value.name);
          var label = document.createElement('label');
          var input = document.createElement('input');
          var text = document.createElement('span');
          label.className = 'weight-option';
          label.classList.toggle('active', selection[option.name] === value.name);
          label.classList.toggle('is-unavailable', !state.available);
          input.type = 'radio';
          input.name = 'option-' + option.name;
          input.value = value.name;
          input.checked = selection[option.name] === value.name;
          input.disabled = !state.available;
          text.className = 'weight-label';
          text.textContent = value.name;
          input.addEventListener('change', function () {
            intent[option.name] = value.name;
            var reachable = selectionForIntent(product, intent);
            if (!reachable) {
              intent = {};
              intent[option.name] = value.name;
              reachable = selectionForIntent(product, intent);
            }
            if (!reachable) return;
            selection = reachable;
            renderAll();
          });
          label.appendChild(input);
          label.appendChild(text);
          values.appendChild(label);
        });
        fieldset.appendChild(legend);
        fieldset.appendChild(values);
        optionsRoot.appendChild(fieldset);
      });
    }

    function renderCommerce(variant) {
      var checkoutable = Boolean(variant && variant.availableForSale);
      if (price) price.textContent = variant ? formatMoney(variant.price) : '';
      if (availability) {
        availability.textContent = checkoutable
          ? 'Available for secure online checkout.'
          : 'This option is unavailable.';
        availability.classList.toggle('is-unavailable', !checkoutable);
      }
      if (addButton) {
        addButton.disabled = !checkoutable;
        addButton.textContent = checkoutable ? 'Add to Cart' : 'Unavailable';
      }
    }

    function renderAll() {
      var variant = currentVariant();
      renderOptions();
      renderGallery(variant);
      renderCommerce(variant);
      return variant;
    }

    if (previous) previous.addEventListener('click', function () { showMedia(mediaIndex - 1); });
    if (next) next.addEventListener('click', function () { showMedia(mediaIndex + 1); });
    if (quantityDecrease) quantityDecrease.addEventListener('click', function () {
      setQuantity(Number(quantityInput ? quantityInput.value : 1) - 1);
    });
    if (quantityIncrease) quantityIncrease.addEventListener('click', function () {
      setQuantity(Number(quantityInput ? quantityInput.value : 1) + 1);
    });
    if (quantityInput) {
      quantityInput.addEventListener('input', function () { setQuantity(quantityInput.value); });
      quantityInput.addEventListener('blur', function () { setQuantity(quantityInput.value); });
    }
    if (addButton) addButton.addEventListener('click', function () {
      var line = buildCartLine(product, currentVariant());
      var count = setQuantity(quantityInput ? quantityInput.value : 1);
      if (!line || !cart || !cart.addExactVariant) return;
      var added = cart.addExactVariant(line, count);
      if (added && cart.showToast) cart.showToast(count + ' × ' + product.title + ' added to cart');
      if (added && cart.openCart) cart.openCart();
    });

    renderAll();
    if (main) main.hidden = false;
    return { getSelection: function () { return Object.assign({}, selection); } };
  }

  return {
    initialSelection: initialSelection,
    resolveVariant: resolveVariant,
    optionValueState: optionValueState,
    orderedMedia: orderedMedia,
    buildCartLine: buildCartLine,
    mount: mount
  };
});

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  var productData = document.getElementById('generic-product-data');
  if (productData && window.BassBingeGenericProduct) {
    try {
      window.BassBingeGenericProduct.mount(
        JSON.parse(productData.textContent),
        window.BassBingeCart
      );
    } catch (error) {
      console.error('Generic product renderer failed', { message: error.message });
    }
  }
}
