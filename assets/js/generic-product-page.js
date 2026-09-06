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

  function normalizeKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function normalizeOptionName(value) {
    return normalizeKey(value).replace(/option-|s$/g, '');
  }

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

  function catalogProductKey(product) {
    if (!product) return null;
    return product.key || product.handle || null;
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

  function formatRattlePriceLabel(label, priceDelta) {
    if (!priceDelta) return String(label || '');
    var amount = Number(priceDelta);
    if (!Number.isFinite(amount) || amount === 0) return String(label || '');
    return String(label || '') + ' (+ $' + amount.toFixed(2) + ')';
  }

  function afterReady(ready, callback) {
    return Promise.resolve(ready).then(callback, callback);
  }

  function galleryMediaNode(doc, item, label, thumbnail) {
    var node;
    var imageUrl = item && item.image && item.image.url;
    if (imageUrl && (!item.type || item.type === 'image')) {
      node = doc.createElement('img');
      node.src = imageUrl;
      node.alt = thumbnail ? '' : label;
      node.draggable = false;
      node.addEventListener('error', function () {
        var fallback = doc.createElement('span');
        fallback.className = thumbnail ? 'product-gallery-media-label' : 'generic-media-placeholder';
        fallback.textContent = thumbnail ? 'Image' : label + ' image unavailable';
        node.replaceWith(fallback);
      });
      return node;
    }
    var sources = item && Array.isArray(item.sources) ? item.sources : [];
    var source = sources.find(function (candidate) {
      return candidate.url && (candidate.mimeType === 'video/mp4' || candidate.format === 'mp4');
    }) || sources.find(function (candidate) { return candidate.url; });
    if (!thumbnail && item && item.type === 'video' && source) {
      node = doc.createElement('video');
      node.controls = true;
      node.playsInline = true;
      node.preload = 'metadata';
      node.src = source.url;
      node.setAttribute('aria-label', label + ' video');
      return node;
    }
    node = doc.createElement('span');
    node.className = thumbnail ? 'product-gallery-media-label' : 'generic-media-placeholder';
    node.textContent = thumbnail && item && item.type === 'video' ? '▶ Video' : thumbnail ? 'Media' : label + ' media unavailable';
    return node;
  }

  function mount(product, cart) {
    if (typeof document === 'undefined' || !product) return null;

    var main = document.querySelector('.product-page');
    var optionsRoot = document.querySelector('[data-generic-options]');
    var galleryMain = document.querySelector('.product-gallery-main');
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
    var scope = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : {});
    var catalog = scope && scope.BassBingeCatalog;
    var taxonomy = scope && scope.BassBingeTaxonomy;
    var admittedProduct = catalog && catalog.getAdmittedProduct
      ? catalog.getAdmittedProduct(product.handle)
      : null;
    var selection = initialSelection(product);
    var selectedRattle = 'no';
    var intent = {};
    var media = [];
    var mediaIndex = 0;
    var zoomToggle = null;
    var zoomModal = null;
    var zoomStage = null;
    var zoomImage = null;
    var zoomCaption = null;
    var zoomCounter = null;
    var zoomClose = null;
    var zoomPrevious = null;
    var zoomNext = null;
    var zoomReturnFocus = null;

    function admittedProductForRender() {
      return admittedProduct || (catalog && catalog.getAdmittedProduct ? catalog.getAdmittedProduct(product.handle) : null);
    }

    function shouldRenderRattleControls() {
      var admitted = admittedProductForRender();
      var presentation = admitted && admitted.presentation;

      if (presentation && typeof presentation.rattleEnabled === 'boolean') {
        return presentation.rattleEnabled;
      }

      if (!taxonomy || typeof taxonomy.categoryForProduct !== 'function') return false;
      return taxonomy.categoryForProduct(admitted || product) === 'jigs';
    }

    function catalogRattleOptions() {
      var admitted = admittedProductForRender();
      if (!admitted || !catalog || typeof catalog.getRattleOptions !== 'function') return [];
      return catalog.getRattleOptions(admitted);
    }

    function selectedVariant() {
      return resolveVariant(product, selection);
    }

    function optionToKey(optionName, value) {
      if (!optionName || typeof value === 'undefined' || value === null) return null;
      var normalized = normalizeOptionName(optionName);
      var valueKey = normalizeKey(value);

      if (/\b(color|colour)\b/.test(normalized) || normalized.indexOf('paint') === 0) {
        return { colorKey: valueKey };
      }
      if (/\b(weight|size|oz|g)\b/.test(normalized) || normalized.indexOf('weight') !== -1) {
        return { weightKey: valueKey };
      }
      return {};
    }

    function buildKeysFromSelection() {
      var current = selectedVariant() || {};
      var selected = (current.selectedOptions || [])
        .reduce(function (accumulator, option) {
          var keys = optionToKey(option.name, option.value);
          if (keys.colorKey) accumulator.colorKey = keys.colorKey;
          if (keys.weightKey) accumulator.weightKey = keys.weightKey;
          return accumulator;
        }, {});

      if (!selected.colorKey && selection.color) selected.colorKey = normalizeKey(selection.color);
      if (!selected.weightKey && selection.weight) selected.weightKey = normalizeKey(selection.weight);

      return selected;
    }

    function currentRattleOption() {
      var rattleOptions = catalogRattleOptions();
      var fallback = rattleOptions.length ? rattleOptions[0] : { key: 'no', label: 'No', available: true, priceDelta: null };

      if (!shouldRenderRattleControls()) return fallback;

      return rattleOptions.find(function (option) {
        return option.key === selectedRattle;
      }) || fallback;
    }

    function buildJigLine() {
      var admitted = admittedProductForRender();
      var productKey = catalogProductKey(admitted);
      if (!catalog || !productKey) return null;

      var keys = buildKeysFromSelection();
      var rattle = currentRattleOption();

      return catalog.getJigBuild({
        productKey: productKey,
        colorKey: keys.colorKey,
        weightKey: keys.weightKey,
        rattleKey: rattle && rattle.key ? rattle.key : 'no'
      });
    }

    function currentImage() {
      var item = media[mediaIndex];
      return item && item.type === 'image' && item.image && item.image.url ? item : null;
    }

    function activeGalleryImage() {
      var activeSlide = track && track.querySelector('.product-gallery-slide.active');
      return activeSlide && activeSlide.querySelector('img');
    }

    function setZoomPosition(event, image, target) {
      var rect, x, y;
      if (!event || !image || !target) return;
      rect = image.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
      y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
      target.style.setProperty('--zoom-x', x + '%');
      target.style.setProperty('--zoom-y', y + '%');
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

    function updateZoomScales() {
      setNativeResolutionZoomScale(activeGalleryImage(), galleryMain, 2.35);
      setNativeResolutionZoomScale(zoomImage, zoomStage, 2.55);
    }

    function resetInlineZoom() {
      if (!galleryMain) return;
      galleryMain.classList.remove('is-zooming');
      galleryMain.style.setProperty('--zoom-x', '50%');
      galleryMain.style.setProperty('--zoom-y', '50%');
    }

    function resetModalZoom() {
      if (!zoomStage) return;
      zoomStage.classList.remove('is-zooming');
      zoomStage.classList.remove('is-zoom-locked');
      zoomStage.style.setProperty('--zoom-x', '50%');
      zoomStage.style.setProperty('--zoom-y', '50%');
    }

    function updateZoomViewer() {
      var item = currentImage();
      if (!zoomModal || zoomModal.hidden) return;
      if (!item) {
        closeZoomViewer();
        return;
      }
      zoomImage.src = item.image.url;
      zoomImage.alt = item.alt || product.title;
      zoomCaption.textContent = item.alt || product.title;
      zoomCounter.textContent = (mediaIndex + 1) + ' / ' + media.length;
      zoomPrevious.disabled = mediaIndex === 0;
      zoomNext.disabled = mediaIndex >= media.length - 1;
      resetModalZoom();
      if (zoomImage.complete) window.requestAnimationFrame(updateZoomScales);
    }

    function closeZoomViewer() {
      if (!zoomModal || zoomModal.hidden) return;
      zoomModal.classList.remove('active');
      zoomModal.hidden = true;
      document.body.classList.remove('product-zoom-open');
      document.removeEventListener('keydown', zoomKeydownHandler);
      resetModalZoom();
      if (zoomReturnFocus && zoomReturnFocus.focus) zoomReturnFocus.focus({ preventScroll: true });
    }

    function zoomKeydownHandler(event) {
      if (event.key === 'Escape') {
        closeZoomViewer();
        event.preventDefault();
      } else if (event.key === 'ArrowLeft' && mediaIndex > 0) {
        showMedia(mediaIndex - 1);
        event.preventDefault();
      } else if (event.key === 'ArrowRight' && mediaIndex < media.length - 1) {
        showMedia(mediaIndex + 1);
        event.preventDefault();
      }
    }

    function ensureZoomViewer() {
      if (zoomModal) return;
      zoomModal = document.createElement('div');
      zoomModal.className = 'product-zoom-modal';
      zoomModal.hidden = true;
      zoomModal.setAttribute('role', 'dialog');
      zoomModal.setAttribute('aria-modal', 'true');
      zoomModal.setAttribute('aria-label', product.title + ' enlarged product photo');
      zoomModal.innerHTML =
        '<div class="product-zoom-backdrop" data-product-zoom-close></div>' +
        '<div class="product-zoom-panel">' +
          '<button class="product-zoom-close" type="button" aria-label="Close product photo zoom">' +
            '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>' +
          '</button>' +
          '<button class="product-zoom-arrow prev" type="button" aria-label="Previous image">' +
            '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>' +
          '</button>' +
          '<div class="product-zoom-stage"><img class="product-zoom-img" src="" alt="" draggable="false" /></div>' +
          '<button class="product-zoom-arrow next" type="button" aria-label="Next image">' +
            '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>' +
          '</button>' +
          '<div class="product-zoom-meta"><span class="product-zoom-caption"></span><span class="product-zoom-counter"></span></div>' +
        '</div>';
      document.body.appendChild(zoomModal);
      zoomStage = zoomModal.querySelector('.product-zoom-stage');
      zoomImage = zoomModal.querySelector('.product-zoom-img');
      zoomCaption = zoomModal.querySelector('.product-zoom-caption');
      zoomCounter = zoomModal.querySelector('.product-zoom-counter');
      zoomClose = zoomModal.querySelector('.product-zoom-close');
      zoomPrevious = zoomModal.querySelector('.product-zoom-arrow.prev');
      zoomNext = zoomModal.querySelector('.product-zoom-arrow.next');
      zoomImage.addEventListener('load', updateZoomScales);
      zoomClose.addEventListener('click', closeZoomViewer);
      zoomPrevious.addEventListener('click', function () { showMedia(mediaIndex - 1); });
      zoomNext.addEventListener('click', function () { showMedia(mediaIndex + 1); });
      zoomModal.addEventListener('click', function (event) {
        if (event.target && event.target.hasAttribute('data-product-zoom-close')) closeZoomViewer();
      });
      zoomStage.addEventListener('pointerenter', function (event) {
        if (event.pointerType !== 'touch') {
          zoomStage.classList.add('is-zooming');
          setZoomPosition(event, zoomImage, zoomStage);
        }
      });
      zoomStage.addEventListener('pointermove', function (event) {
        if (event.pointerType === 'touch') return;
        if (zoomStage.classList.contains('is-zooming')) setZoomPosition(event, zoomImage, zoomStage);
      });
      zoomStage.addEventListener('pointerleave', function (event) {
        if (event.pointerType !== 'touch') resetModalZoom();
      });
      zoomStage.addEventListener('pointerup', function (event) {
        if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
        if (zoomStage.classList.contains('is-zoom-locked')) {
          resetModalZoom();
        } else {
          setZoomPosition(event, zoomImage, zoomStage);
          zoomStage.classList.add('is-zoom-locked');
        }
        event.preventDefault();
      });
    }

    function openZoomViewer() {
      if (!currentImage()) return;
      ensureZoomViewer();
      zoomReturnFocus = document.activeElement && document.activeElement.focus
        ? document.activeElement
        : null;
      zoomModal.hidden = false;
      document.body.classList.add('product-zoom-open');
      updateZoomViewer();
      window.requestAnimationFrame(function () { zoomModal.classList.add('active'); });
      document.addEventListener('keydown', zoomKeydownHandler);
      zoomClose.focus({ preventScroll: true });
    }

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
      resetInlineZoom();
      if (track) Array.from(track.children).forEach(function (slide, slideIndex) {
        slide.classList.toggle('active', slideIndex === mediaIndex);
        slide.hidden = slideIndex !== mediaIndex;
        var video = slide.querySelector('video');
        if (video && slide.hidden) video.pause();
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
      if (zoomToggle) zoomToggle.hidden = !currentImage();
      updateZoomViewer();
      updateZoomScales();
    }

    function appendMedia(slide, item) {
      var label = item && item.alt || product.title;
      var node = galleryMediaNode(document, item, label, false);
      if (node.tagName === 'IMG') node.addEventListener('load', updateZoomScales);
      slide.appendChild(node);
    }

    function renderGallery(variant) {
      media = orderedMedia(product, variant);
      if (track) track.textContent = '';
      if (thumbs) thumbs.textContent = '';
      media.forEach(function (item, index) {
        var slide = document.createElement('div');
        var thumb = document.createElement('button');
        slide.className = 'product-gallery-slide';
        appendMedia(slide, item);
        thumb.type = 'button';
        thumb.className = 'product-gallery-thumb';
        thumb.setAttribute('aria-label', 'View ' + product.title + ' ' + (item.type === 'video' ? 'video' : 'image') + ' ' + (index + 1));
        thumb.appendChild(galleryMediaNode(document, item, product.title, true));
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

      if (shouldRenderRattleControls()) {
        var rattleOptions = catalogRattleOptions();
        var rattleFieldset = document.createElement('fieldset');
        var rattleLegend = document.createElement('legend');
        var rattleValues = document.createElement('div');

        rattleFieldset.className = 'product-config-selector generic-option-group';
        rattleFieldset.setAttribute('data-rattle-group', 'generic');
        rattleLegend.className = 'config-label';
        rattleLegend.textContent = 'Rattle:';
        rattleValues.className = 'weight-options';

        (rattleOptions.length ? rattleOptions : [{ key: 'no', label: 'No', available: true }])
          .forEach(function (rattle) {
            var rattleLabel = document.createElement('label');
            var rattleInput = document.createElement('input');
            var rattleText = document.createElement('span');

            rattleLabel.className = 'weight-option';
            rattleLabel.classList.toggle('active', selectedRattle === rattle.key);
            rattleLabel.classList.toggle('is-unavailable', rattle.available === false);

            rattleInput.type = 'radio';
            rattleInput.name = 'rattle';
            rattleInput.value = rattle.key;
            rattleInput.checked = selectedRattle === rattle.key;
            rattleInput.disabled = rattle.available === false;

            rattleText.className = 'weight-label';
            rattleText.textContent = formatRattlePriceLabel(rattle.label, rattle.priceDelta);

            rattleInput.addEventListener('change', function () {
              if (rattleInput.checked) {
                selectedRattle = rattle.key;
                renderAll();
              }
            });

            rattleLabel.appendChild(rattleInput);
            rattleLabel.appendChild(rattleText);
            rattleValues.appendChild(rattleLabel);
          });

        rattleFieldset.appendChild(rattleLegend);
        rattleFieldset.appendChild(rattleValues);
        optionsRoot.appendChild(rattleFieldset);
      }
    }

    function renderCommerce(variant) {
      var shouldUseJigBuild = shouldRenderRattleControls();
      var jigLine = shouldUseJigBuild ? buildJigLine() : null;
      var checkoutable = jigLine
        ? Boolean(jigLine.isCheckoutable)
        : shouldUseJigBuild
          ? Boolean(variant && variant.availableForSale)
          : Boolean(variant && variant.availableForSale);

      if (price) {
        if (jigLine && typeof catalog.formatMoney === 'function') {
          price.textContent = catalog.formatMoney(jigLine.price);
        } else if (jigLine && jigLine.price) {
          price.textContent = '$' + Number(jigLine.price).toFixed(2);
        } else {
          price.textContent = variant ? formatMoney(variant.price) : '';
        }
      }
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
    if (galleryMain) {
      zoomToggle = document.createElement('button');
      zoomToggle.type = 'button';
      zoomToggle.className = 'product-gallery-zoom-toggle';
      zoomToggle.setAttribute('aria-label', 'Open larger product photo');
      zoomToggle.innerHTML =
        '<svg aria-hidden="true" viewBox="0 0 24 24">' +
          '<circle cx="11" cy="11" r="6" /><path d="m16 16 4 4" /><path d="M11 8v6M8 11h6" />' +
        '</svg>';
      zoomToggle.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openZoomViewer();
      });
      galleryMain.appendChild(zoomToggle);
      track.addEventListener('pointerenter', function (event) {
        if (event.pointerType === 'touch' || !currentImage()) return;
        galleryMain.classList.add('is-zooming');
        setZoomPosition(event, activeGalleryImage(), galleryMain);
      });
      track.addEventListener('pointermove', function (event) {
        if (event.pointerType === 'touch' || !galleryMain.classList.contains('is-zooming')) return;
        setZoomPosition(event, activeGalleryImage(), galleryMain);
      });
      track.addEventListener('pointerleave', resetInlineZoom);
      track.addEventListener('click', openZoomViewer);
    }
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
      var count = setQuantity(quantityInput ? quantityInput.value : 1);
      var shouldUseJigBuild = shouldRenderRattleControls();
      var added = null;
      var jigLine = buildJigLine();
      var variant = currentVariant();
      if (shouldUseJigBuild && jigLine && typeof cart.addJigBuild === 'function') {
        if (!jigLine.isCheckoutable) return;
        added = cart.addJigBuild(jigLine, count);
      } else if (!shouldUseJigBuild || !jigLine) {
        var line = buildCartLine(product, variant);
        if (!line || !cart || !cart.addExactVariant) return;
        added = cart.addExactVariant(line, count);
      } else {
        return;
      }
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
    catalogProductKey: catalogProductKey,
    formatRattlePriceLabel: formatRattlePriceLabel,
    afterReady: afterReady,
    galleryMediaNode: galleryMediaNode,
    mount: mount
  };
});

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  var productData = document.getElementById('generic-product-data');
  if (productData && window.BassBingeGenericProduct) {
    window.BassBingeGenericProduct.afterReady(
      window.BassBingeCatalog && window.BassBingeCatalog.ready,
      function () {
        try {
          window.BassBingeGenericProduct.mount(
            JSON.parse(productData.textContent),
            window.BassBingeCart
          );
        } catch (error) {
          console.error('Generic product renderer failed', { message: error.message });
        }
      }
    );
  }
}
