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

  function optionNames(product) {
    return (product && Array.isArray(product.options) ? product.options : []).map(function (option) {
      return option.name;
    });
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
    var initial = variants.find(function (variant) {
      return variant.availableForSale;
    }) || variants[0];
    return selectionForVariant(initial);
  }

  function variantMatches(product, variant, selection, allowPartial) {
    var selected = selectionForVariant(variant);
    var names = optionNames(product);
    if (!allowPartial && Object.keys(selection || {}).length !== names.length) return false;
    return names.every(function (name) {
      return !Object.prototype.hasOwnProperty.call(selection || {}, name) ||
        selected[name] === selection[name];
    });
  }

  function resolveVariant(product, selection) {
    var variants = product && Array.isArray(product.variants) ? product.variants : [];
    return variants.find(function (variant) {
      return variantMatches(product, variant, selection || {}, false);
    }) || null;
  }

  function optionValueState(product, selection, optionName, value) {
    var variants = product && Array.isArray(product.variants) ? product.variants : [];
    var matches = variants.filter(function (variant) {
      var selected = selectionForVariant(variant);
      return Object.prototype.hasOwnProperty.call(selected, optionName) &&
        selected[optionName] === value;
    });
    return {
      exists: matches.length > 0,
      available: matches.some(function (variant) {
        return variant.availableForSale;
      })
    };
  }

  function selectionForOptionIntent(product, intent) {
    var variants = product && Array.isArray(product.variants) ? product.variants : [];
    var names = Object.keys(intent || {});
    var reachable = variants.find(function (variant) {
      if (!variant.availableForSale) return false;
      var selected = selectionForVariant(variant);
      return names.every(function (name) {
        return Object.prototype.hasOwnProperty.call(selected, name) &&
          selected[name] === intent[name];
      });
    });
    return reachable ? selectionForVariant(reachable) : null;
  }

  function mediaMatchesImage(media, imageId) {
    return Boolean(imageId && media && (
      media.id === imageId ||
      (media.image && media.image.id === imageId)
    ));
  }

  function orderedMedia(product, variant) {
    var media = product && Array.isArray(product.media) ? product.media.slice() : [];
    var imageId = variant && variant.imageId;
    var leadIndex = media.findIndex(function (item) {
      return mediaMatchesImage(item, imageId);
    });
    if (leadIndex < 0 && variant && variant.image && variant.image.url) {
      leadIndex = media.findIndex(function (item) {
        return item && item.image && item.image.url === variant.image.url;
      });
    }
    if (leadIndex > 0) {
      media.unshift(media.splice(leadIndex, 1)[0]);
    }
    return media;
  }

  function mediaPresentation(media, productTitle) {
    var label = media && media.alt || productTitle || 'Product media';
    if (!media) {
      return {
        type: 'placeholder',
        label: 'Product image unavailable' + (productTitle ? ' for ' + productTitle : '')
      };
    }
    if (media.type === 'image' && media.image && media.image.url) {
      return { type: 'image', src: media.image.url, alt: label };
    }
    if (media.type === 'video' && Array.isArray(media.sources) && media.sources.length) {
      return {
        type: 'video',
        sources: media.sources.slice(),
        label: label
      };
    }
    if (media.type === 'external-video' && media.embedUrl) {
      return { type: 'external-video', src: media.embedUrl, label: label };
    }
    if (media.type === 'model-3d' && Array.isArray(media.sources) && media.sources.length) {
      return { type: 'model-3d', src: media.sources[0].url, label: label };
    }
    return { type: 'placeholder', label: label + ' is unavailable' };
  }

  function variantImage(product, variant) {
    if (variant && variant.image && variant.image.url) {
      return variant.image.url;
    }
    var media = orderedMedia(product, variant);
    var image = media.find(function (item) {
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
    var amount = Number(money.amount);
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: money.currencyCode
      }).format(amount);
    } catch (error) {
      return '$' + amount.toFixed(2);
    }
  }

  function appendMediaContent(slide, media, productTitle) {
    var presentation = mediaPresentation(media, productTitle);
    var node;
    if (presentation.type === 'image') {
      node = document.createElement('img');
      node.src = presentation.src;
      node.alt = presentation.alt;
      node.loading = 'eager';
    } else if (presentation.type === 'video') {
      node = document.createElement('video');
      node.controls = true;
      node.preload = 'metadata';
      node.setAttribute('aria-label', presentation.label);
      presentation.sources.forEach(function (source) {
        var sourceNode = document.createElement('source');
        sourceNode.src = source.url;
        if (source.mimeType) sourceNode.type = source.mimeType;
        node.appendChild(sourceNode);
      });
    } else if (presentation.type === 'external-video') {
      node = document.createElement('iframe');
      node.src = presentation.src;
      node.title = presentation.label;
      node.loading = 'lazy';
      node.allow = 'autoplay; encrypted-media; picture-in-picture';
      node.allowFullscreen = true;
    } else if (presentation.type === 'model-3d') {
      node = document.createElement('a');
      node.className = 'generic-media-placeholder';
      node.href = presentation.src;
      node.textContent = 'View 3D model';
      node.setAttribute('aria-label', presentation.label);
    } else {
      node = document.createElement('div');
      node.className = 'generic-media-placeholder';
      node.textContent = presentation.label;
    }
    slide.appendChild(node);
  }

  function createThumb(media, productTitle) {
    var presentation = mediaPresentation(media, productTitle);
    var thumb = document.createElement('button');
    var visual;
    var accessibleLabel = presentation.label || presentation.alt || productTitle || 'Product media';
    thumb.type = 'button';
    thumb.className = 'product-gallery-thumb';
    if (presentation.type === 'image') {
      visual = document.createElement('img');
      visual.src = presentation.src;
      visual.alt = '';
      visual.loading = 'lazy';
    } else {
      visual = document.createElement('span');
      visual.className = 'generic-media-thumb';
      visual.textContent = presentation.type === 'video' || presentation.type === 'external-video'
        ? '▶'
        : presentation.type === 'model-3d' ? '3D' : '—';
    }
    thumb.setAttribute('aria-label', 'Show ' + accessibleLabel);
    thumb.appendChild(visual);
    return thumb;
  }

  function mount(product, cart) {
    if (typeof document === 'undefined' || !product) return null;
    var selection = initialSelection(product);
    var selectionIntent = {};
    var selectionIntentOrder = [];
    var optionsRoot = document.querySelector('[data-generic-options]');
    var gallery = document.querySelector('[data-generic-gallery]');
    var galleryMain = document.querySelector('[data-gallery-main]');
    var track = document.querySelector('[data-gallery-track]');
    var thumbs = document.querySelector('[data-gallery-thumbs]');
    var counter = document.querySelector('[data-gallery-counter]');
    var prev = document.querySelector('[data-gallery-prev]');
    var next = document.querySelector('[data-gallery-next]');
    var zoomOpen = document.querySelector('[data-gallery-zoom-open]');
    var zoomModal = document.querySelector('[data-product-zoom-modal]');
    var zoomStage = document.querySelector('[data-product-zoom-stage]');
    var zoomImage = document.querySelector('[data-product-zoom-image]');
    var zoomCaption = document.querySelector('[data-product-zoom-caption]');
    var zoomCounter = document.querySelector('[data-product-zoom-counter]');
    var zoomPrev = document.querySelector('[data-product-zoom-prev]');
    var zoomNext = document.querySelector('[data-product-zoom-next]');
    var zoomClose = document.querySelector('button[data-product-zoom-close]');
    var zoomCloseButtons = Array.from(document.querySelectorAll('[data-product-zoom-close]'));
    var price = document.querySelector('[data-price-display]');
    var availability = document.querySelector('[data-product-availability]');
    var addButton = document.querySelector('[data-add-cart]');
    var currentMedia = [];
    var currentSlide = 0;
    var zoomReturnFocus = null;

    function currentVariant() {
      return resolveVariant(product, selection);
    }

    function currentPresentation() {
      return mediaPresentation(currentMedia[currentSlide], product.title);
    }

    function clampPercent(value) {
      return Math.max(0, Math.min(100, value));
    }

    function setZoomPosition(event, image, target) {
      var rect;
      var x;
      var y;
      if (!event || !image || !target) return;
      rect = image.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      x = clampPercent(((event.clientX - rect.left) / rect.width) * 100);
      y = clampPercent(((event.clientY - rect.top) / rect.height) * 100);
      target.style.setProperty('--zoom-x', x + '%');
      target.style.setProperty('--zoom-y', y + '%');
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

    function activeGalleryImage() {
      var activeSlide = track && track.querySelector('.product-gallery-slide.active');
      return activeSlide && activeSlide.querySelector('img');
    }

    function updateZoomViewer() {
      var presentation = currentPresentation();
      var canZoom = presentation.type === 'image';
      if (zoomOpen) zoomOpen.hidden = !canZoom;
      if (!canZoom) {
        resetInlineZoom();
        if (zoomModal && !zoomModal.hidden) closeZoomViewer();
        return;
      }
      if (!zoomModal || zoomModal.hidden) return;
      if (zoomImage) {
        zoomImage.src = presentation.src;
        zoomImage.alt = presentation.alt;
      }
      if (zoomCaption) zoomCaption.textContent = presentation.alt;
      if (zoomCounter) zoomCounter.textContent = (currentSlide + 1) + ' / ' + currentMedia.length;
      if (zoomPrev) zoomPrev.disabled = currentSlide <= 0;
      if (zoomNext) zoomNext.disabled = currentSlide >= currentMedia.length - 1;
      resetModalZoom();
    }

    function closeZoomViewer() {
      if (!zoomModal || zoomModal.hidden) return;
      zoomModal.classList.remove('active');
      zoomModal.hidden = true;
      document.body.classList.remove('product-zoom-open');
      resetModalZoom();
      if (zoomReturnFocus && zoomReturnFocus.focus) {
        zoomReturnFocus.focus({ preventScroll: true });
      }
    }

    function openZoomViewer() {
      if (!zoomModal || currentPresentation().type !== 'image') return;
      zoomReturnFocus = document.activeElement && document.activeElement.focus
        ? document.activeElement
        : zoomOpen;
      resetInlineZoom();
      zoomModal.hidden = false;
      document.body.classList.add('product-zoom-open');
      updateZoomViewer();
      if (typeof window !== 'undefined' && window.requestAnimationFrame) {
        window.requestAnimationFrame(function () {
          zoomModal.classList.add('active');
        });
      } else {
        zoomModal.classList.add('active');
      }
      if (zoomClose && zoomClose.focus) {
        zoomClose.focus({ preventScroll: true });
      }
    }

    function showSlide(index) {
      if (!currentMedia.length) index = 0;
      currentSlide = Math.max(0, Math.min(index, Math.max(currentMedia.length - 1, 0)));
      if (track) {
        Array.from(track.children).forEach(function (slide, slideIndex) {
          slide.classList.toggle('active', slideIndex === currentSlide);
        });
      }
      if (thumbs) {
        Array.from(thumbs.children).forEach(function (thumb, thumbIndex) {
          thumb.classList.toggle('active', thumbIndex === currentSlide);
          thumb.setAttribute('aria-pressed', String(thumbIndex === currentSlide));
        });
      }
      if (counter) {
        counter.textContent = currentMedia.length
          ? (currentSlide + 1) + ' / ' + currentMedia.length
          : 'No image';
      }
      if (prev) prev.disabled = currentSlide <= 0;
      if (next) next.disabled = currentSlide >= currentMedia.length - 1;
      resetInlineZoom();
      updateZoomViewer();
    }

    function renderGallery(variant) {
      currentMedia = orderedMedia(product, variant);
      if (!currentMedia.length) currentMedia = [null];
      if (track) track.textContent = '';
      if (thumbs) thumbs.textContent = '';
      currentMedia.forEach(function (media, index) {
        var slide = document.createElement('div');
        var thumb = createThumb(media, product.title);
        slide.className = 'product-gallery-slide';
        appendMediaContent(slide, media, product.title);
        thumb.addEventListener('click', function () {
          showSlide(index);
        });
        if (track) track.appendChild(slide);
        if (thumbs) thumbs.appendChild(thumb);
      });
      showSlide(0);
    }

    function renderOptions() {
      if (!optionsRoot) return;
      optionsRoot.textContent = '';
      (product.options || []).forEach(function (option) {
        var group = document.createElement('fieldset');
        var legend = document.createElement('legend');
        var values = document.createElement('div');
        group.className = 'product-config-selector generic-option-group';
        legend.className = 'config-label';
        legend.textContent = option.name + ':';
        values.className = 'weight-options';
        (option.values || []).forEach(function (value) {
          var state = optionValueState(product, selection, option.name, value.name);
          var label = document.createElement('label');
          var input = document.createElement('input');
          var text = document.createElement('span');
          label.className = 'weight-option';
          label.dataset.optionName = option.name;
          label.dataset.optionValue = value.name;
          label.classList.toggle('active', selection[option.name] === value.name);
          label.classList.toggle('is-unavailable', !state.available);
          input.type = 'radio';
          input.name = 'option-' + option.name;
          input.value = value.name;
          input.checked = selection[option.name] === value.name;
          input.disabled = !state.available;
          text.className = 'weight-label';
          text.textContent = value.name;
          label.title = state.available
            ? value.name
            : value.name + (state.exists ? ' is sold out' : ' is not offered with this selection');
          input.addEventListener('change', function () {
            selectionIntent[option.name] = value.name;
            selectionIntentOrder = selectionIntentOrder.filter(function (name) {
              return name !== option.name;
            });
            selectionIntentOrder.push(option.name);
            var reachable = selectionForOptionIntent(product, selectionIntent);
            while (!reachable && selectionIntentOrder.length > 1) {
              delete selectionIntent[selectionIntentOrder.shift()];
              reachable = selectionForOptionIntent(product, selectionIntent);
            }
            if (!reachable) return;
            selection = reachable;
            renderAll();
          });
          label.appendChild(input);
          label.appendChild(text);
          values.appendChild(label);
        });
        group.appendChild(legend);
        group.appendChild(values);
        optionsRoot.appendChild(group);
      });
    }

    function renderCommerce(variant) {
      var checkoutable = Boolean(variant && variant.availableForSale);
      if (price) price.textContent = variant ? formatMoney(variant.price) : '';
      if (availability) {
        availability.textContent = checkoutable
          ? 'Available for secure online checkout.'
          : variant ? 'This combination is sold out.' : 'This combination is unavailable.';
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

    if (prev) prev.addEventListener('click', function () {
      showSlide(currentSlide - 1);
    });
    if (next) next.addEventListener('click', function () {
      showSlide(currentSlide + 1);
    });
    if (zoomOpen) zoomOpen.addEventListener('click', openZoomViewer);
    if (track) {
      track.addEventListener('click', function (event) {
        if (event.target && event.target.closest && event.target.closest('a, button, video')) return;
        openZoomViewer();
      });
      track.addEventListener('pointerenter', function (event) {
        if (event.pointerType === 'touch' || currentPresentation().type !== 'image') return;
        if (galleryMain) galleryMain.classList.add('is-zooming');
        setZoomPosition(event, activeGalleryImage(), galleryMain);
      });
      track.addEventListener('pointermove', function (event) {
        if (!galleryMain || !galleryMain.classList.contains('is-zooming')) return;
        if (event.pointerType === 'touch') return;
        setZoomPosition(event, activeGalleryImage(), galleryMain);
      });
      track.addEventListener('pointerleave', resetInlineZoom);
    }
    zoomCloseButtons.forEach(function (button) {
      button.addEventListener('click', closeZoomViewer);
    });
    if (zoomPrev) zoomPrev.addEventListener('click', function () {
      showSlide(currentSlide - 1);
    });
    if (zoomNext) zoomNext.addEventListener('click', function () {
      showSlide(currentSlide + 1);
    });
    if (zoomStage) {
      zoomStage.addEventListener('pointerenter', function (event) {
        if (event.pointerType === 'touch') return;
        zoomStage.classList.add('is-zooming');
        setZoomPosition(event, zoomImage, zoomStage);
      });
      zoomStage.addEventListener('pointermove', function (event) {
        if (!zoomStage.classList.contains('is-zooming') &&
            !zoomStage.classList.contains('is-zoom-locked')) return;
        setZoomPosition(event, zoomImage, zoomStage);
      });
      zoomStage.addEventListener('pointerleave', function () {
        zoomStage.classList.remove('is-zooming');
        if (!zoomStage.classList.contains('is-zoom-locked')) {
          zoomStage.style.setProperty('--zoom-x', '50%');
          zoomStage.style.setProperty('--zoom-y', '50%');
        }
      });
      zoomStage.addEventListener('click', function (event) {
        var locked = zoomStage.classList.toggle('is-zoom-locked');
        if (locked) {
          setZoomPosition(event, zoomImage, zoomStage);
        } else {
          zoomStage.style.setProperty('--zoom-x', '50%');
          zoomStage.style.setProperty('--zoom-y', '50%');
        }
      });
      zoomStage.addEventListener('contextmenu', function (event) {
        event.preventDefault();
      });
    }
    if (zoomModal) {
      zoomModal.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          closeZoomViewer();
          event.preventDefault();
        } else if (event.key === 'ArrowLeft' && currentSlide > 0) {
          showSlide(currentSlide - 1);
          event.preventDefault();
        } else if (event.key === 'ArrowRight' && currentSlide < currentMedia.length - 1) {
          showSlide(currentSlide + 1);
          event.preventDefault();
        }
      });
    }
    if (gallery) {
      gallery.setAttribute('tabindex', '0');
      gallery.addEventListener('keydown', function (event) {
        if (event.key === 'ArrowLeft' && currentSlide > 0) {
          showSlide(currentSlide - 1);
          event.preventDefault();
        } else if (event.key === 'ArrowRight' && currentSlide < currentMedia.length - 1) {
          showSlide(currentSlide + 1);
          event.preventDefault();
        } else if (event.key === 'Enter' && currentPresentation().type === 'image') {
          openZoomViewer();
          event.preventDefault();
        }
      });
    }
    if (addButton) addButton.addEventListener('click', function () {
      var line = buildCartLine(product, currentVariant());
      if (!line || !cart || !cart.addExactVariant) return;
      var added = cart.addExactVariant(line, 1);
      if (added && cart.showToast) cart.showToast(product.title + ' added to cart');
      if (added && cart.openCart) cart.openCart();
    });

    renderAll();
    return {
      getSelection: function () {
        return Object.assign({}, selection);
      },
      getVariant: currentVariant
    };
  }

  return {
    initialSelection: initialSelection,
    resolveVariant: resolveVariant,
    optionValueState: optionValueState,
    selectionForOptionIntent: selectionForOptionIntent,
    orderedMedia: orderedMedia,
    mediaPresentation: mediaPresentation,
    createThumb: createThumb,
    buildCartLine: buildCartLine,
    formatMoney: formatMoney,
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
