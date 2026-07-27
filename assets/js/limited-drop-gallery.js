(function (root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.BassBingeLimitedDropGallery = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function mediaItems(product, fallback) {
    var title = product && product.title || fallback && fallback.alt || 'Limited-drop product';
    var media = product && Array.isArray(product.media) ? product.media : [];
    var items = media.map(function (item, index) {
      var label = item && item.alt || title + ' media ' + (index + 1);
      if (item && item.type === 'image' && item.image && item.image.url) {
        return {
          id: item.id || 'image-' + index,
          type: 'image',
          label: label,
          src: item.image.url
        };
      }
      if (item && item.type === 'video' && Array.isArray(item.sources)) {
        var sources = item.sources.filter(function (source) {
          return source && source.url;
        }).map(function (source) {
          return Object.assign({}, source);
        });
        if (sources.length) {
          return {
            id: item.id || 'video-' + index,
            type: 'video',
            label: label,
            sources: sources
          };
        }
      }
      if (item && item.type === 'external-video' && item.embedUrl) {
        return {
          id: item.id || 'external-video-' + index,
          type: 'external-video',
          label: label,
          src: item.embedUrl
        };
      }
      if (item && item.type === 'model-3d' && Array.isArray(item.sources)) {
        var modelSource = item.sources.find(function (source) {
          return source && source.url;
        });
        if (modelSource) {
          return {
            id: item.id || 'model-3d-' + index,
            type: 'model-3d',
            label: label,
            src: modelSource.url
          };
        }
      }
      return {
        id: item && item.id || 'media-' + index,
        type: 'placeholder',
        label: label + ' is unavailable'
      };
    });

    if (!items.length && fallback && fallback.src) {
      items.push({
        id: 'fallback-image',
        type: 'image',
        label: fallback.alt || title,
        src: fallback.src
      });
    }
    return items;
  }

  function nextIndex(current, length, delta) {
    if (!length) return 0;
    return (current + delta % length + length) % length;
  }

  function zoomIcon() {
    var icon = document.createElement('span');
    icon.className = 'limited-drop-zoom-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"></circle>' +
      '<path d="m16 16 4 4M11 8v6M8 11h6"></path></svg>';
    return icon;
  }

  function appendItem(slide, item) {
    var node;
    if (item.type === 'image') {
      node = document.createElement('button');
      node.type = 'button';
      node.className = 'limited-drop-zoom-target';
      node.setAttribute('data-drop-zoom-open', '');
      node.setAttribute('aria-label', 'Open larger ' + item.label);
      var image = document.createElement('img');
      image.src = item.src;
      image.alt = item.label;
      image.loading = 'eager';
      image.draggable = false;
      image.setAttribute('data-drop-image', '');
      node.appendChild(image);
      node.appendChild(zoomIcon());
    } else if (item.type === 'video') {
      node = document.createElement('video');
      node.controls = true;
      node.playsInline = true;
      node.preload = 'metadata';
      node.setAttribute('aria-label', item.label);
      item.sources.forEach(function (source) {
        var sourceNode = document.createElement('source');
        sourceNode.src = source.url;
        if (source.mimeType) sourceNode.type = source.mimeType;
        node.appendChild(sourceNode);
      });
    } else if (item.type === 'external-video') {
      node = document.createElement('iframe');
      node.src = item.src;
      node.title = item.label;
      node.loading = 'lazy';
      node.allow = 'autoplay; encrypted-media; picture-in-picture';
      node.allowFullscreen = true;
    } else if (item.type === 'model-3d') {
      node = document.createElement('a');
      node.className = 'generic-media-placeholder';
      node.href = item.src;
      node.textContent = 'View 3D model';
      node.setAttribute('aria-label', item.label);
    } else {
      node = document.createElement('div');
      node.className = 'product-media-placeholder generic-media-placeholder';
      node.textContent = item.label;
    }
    slide.appendChild(node);
  }

  function mount(card, product, fallback) {
    if (typeof document === 'undefined' || !card) return null;
    var track = card.querySelector('[data-drop-media-track]');
    var previous = card.querySelector('[data-drop-media-previous]');
    var next = card.querySelector('[data-drop-media-next]');
    var counter = card.querySelector('[data-drop-media-counter]');
    var items = mediaItems(product, fallback);
    var current = 0;
    var initialized = false;
    if (!track || !items.length) return null;

    track.innerHTML = '';
    items.forEach(function (item, index) {
      var slide = document.createElement('div');
      slide.className = 'limited-drop-slide';
      slide.setAttribute('data-drop-media-slide', '');
      slide.setAttribute('aria-label', (index + 1) + ' of ' + items.length + ': ' + item.label);
      appendItem(slide, item);
      track.appendChild(slide);
    });

    function show(index) {
      var previousIndex = initialized ? current : null;
      current = nextIndex(index, items.length, 0);
      Array.from(track.children).forEach(function (slide, slideIndex) {
        var active = slideIndex === current;
        slide.hidden = !active;
        slide.classList.toggle('active', active);
        if (!active && slideIndex === previousIndex) {
          var video = slide.querySelector('video');
          if (video) video.pause();
        }
      });
      initialized = true;
      if (counter) counter.textContent = (current + 1) + ' / ' + items.length;
      if (previous) previous.disabled = items.length < 2;
      if (next) next.disabled = items.length < 2;
      return current;
    }

    if (previous) previous.addEventListener('click', function () {
      show(nextIndex(current, items.length, -1));
    });
    if (next) next.addEventListener('click', function () {
      show(nextIndex(current, items.length, 1));
    });
    card.addEventListener('keydown', function (event) {
      if (event.target && event.target.tagName === 'VIDEO') return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        show(nextIndex(current, items.length, -1));
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        show(nextIndex(current, items.length, 1));
      }
    });
    show(0);
    return {
      items: items.slice(),
      getIndex: function () { return current; },
      show: show
    };
  }

  return {
    mediaItems: mediaItems,
    nextIndex: nextIndex,
    mount: mount
  };
});
