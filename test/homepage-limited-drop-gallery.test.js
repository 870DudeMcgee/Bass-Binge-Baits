'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const homepageGallery = require('../assets/js/limited-drop-gallery.js');

class FakeClassList {
  constructor(element) {
    this.element = element;
  }

  values() {
    return this.element.className.split(/\s+/).filter(Boolean);
  }

  contains(name) {
    return this.values().includes(name);
  }

  toggle(name, force) {
    const names = new Set(this.values());
    const enabled = force === undefined ? !names.has(name) : Boolean(force);
    if (enabled) names.add(name);
    else names.delete(name);
    this.element.className = Array.from(names).join(' ');
    return enabled;
  }
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.className = '';
    this.classList = new FakeClassList(this);
    this.listeners = {};
    this.hidden = false;
    this.disabled = false;
    this.pauseCalls = 0;
    this.textContent = '';
    this._innerHTML = '';
  }

  set innerHTML(value) {
    this._innerHTML = String(value);
    if (!value) this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
  }

  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  dispatch(type, properties = {}) {
    const event = Object.assign({
      target: this,
      preventDefault() {}
    }, properties);
    (this.listeners[type] || []).forEach((listener) => listener(event));
  }

  pause() {
    this.pauseCalls += 1;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const matchesSelector = (element) => {
      if (selector.startsWith('[') && selector.endsWith(']')) {
        return element.getAttribute(selector.slice(1, -1)) !== null;
      }
      if (selector.startsWith('.')) {
        return element.classList.contains(selector.slice(1));
      }
      return element.tagName === selector.toUpperCase();
    };
    const visit = (element) => {
      element.children.forEach((child) => {
        if (matchesSelector(child)) matches.push(child);
        visit(child);
      });
    };
    visit(this);
    return matches;
  }
}

function createMountHarness() {
  const card = new FakeElement('article');
  const track = card.appendChild(new FakeElement('div'));
  const previous = card.appendChild(new FakeElement('button'));
  const next = card.appendChild(new FakeElement('button'));
  const counter = card.appendChild(new FakeElement('span'));
  track.appendChild(new FakeElement('div'));
  track.setAttribute('data-drop-media-track', '');
  previous.setAttribute('data-drop-media-previous', '');
  next.setAttribute('data-drop-media-next', '');
  counter.setAttribute('data-drop-media-counter', '');
  return {
    card,
    track,
    previous,
    next,
    counter,
    document: {
      createElement(tagName) {
        return new FakeElement(tagName);
      }
    }
  };
}

function withDocument(document, callback) {
  const originalDocument = global.document;
  global.document = document;
  try {
    return callback();
  } finally {
    if (originalDocument === undefined) delete global.document;
    else global.document = originalDocument;
  }
}

test('homepage limited-drop gallery preserves every ordered Shopify media type', () => {
  const items = homepageGallery.mediaItems({
    title: '5/8 oz PeeWee Football HD — Heartlander',
    media: [
      {
        id: 'main',
        type: 'image',
        alt: 'Heartlander main view',
        image: { url: 'https://cdn.shopify.com/heartlander-main.jpg' }
      },
      {
        id: 'video',
        type: 'video',
        alt: 'Heartlander video',
        sources: [{ url: 'https://cdn.shopify.com/heartlander.mp4', mimeType: 'video/mp4' }]
      },
      {
        id: 'external-video',
        type: 'external-video',
        alt: 'Heartlander tying video',
        embedUrl: 'https://www.youtube-nocookie.com/embed/heartlander'
      },
      {
        id: 'model',
        type: 'model-3d',
        alt: 'Heartlander 3D model',
        sources: [{ url: 'https://cdn.shopify.com/heartlander.glb', mimeType: 'model/gltf-binary' }]
      }
    ]
  });

  assert.deepEqual(items, [
    {
      id: 'main',
      type: 'image',
      label: 'Heartlander main view',
      src: 'https://cdn.shopify.com/heartlander-main.jpg'
    },
    {
      id: 'video',
      type: 'video',
      label: 'Heartlander video',
      sources: [{ url: 'https://cdn.shopify.com/heartlander.mp4', mimeType: 'video/mp4' }]
    },
    {
      id: 'external-video',
      type: 'external-video',
      label: 'Heartlander tying video',
      src: 'https://www.youtube-nocookie.com/embed/heartlander'
    },
    {
      id: 'model',
      type: 'model-3d',
      label: 'Heartlander 3D model',
      src: 'https://cdn.shopify.com/heartlander.glb'
    }
  ]);
});

test('unsupported and malformed admitted media keep ordered accessible fallback projections', () => {
  const items = homepageGallery.mediaItems({
    title: 'Heartlander',
    media: [
      {
        id: 'image',
        type: 'image',
        alt: 'Heartlander image',
        image: { url: 'https://cdn.shopify.com/heartlander.jpg' }
      },
      {
        id: 'unsupported',
        type: 'audio',
        alt: 'Heartlander audio'
      },
      {
        id: 'broken-video',
        type: 'video',
        sources: []
      },
      {
        id: 'broken-external',
        type: 'external-video',
        embedUrl: null
      }
    ]
  });

  assert.deepEqual(items, [
    {
      id: 'image',
      type: 'image',
      label: 'Heartlander image',
      src: 'https://cdn.shopify.com/heartlander.jpg'
    },
    {
      id: 'unsupported',
      type: 'placeholder',
      label: 'Heartlander audio is unavailable'
    },
    {
      id: 'broken-video',
      type: 'placeholder',
      label: 'Heartlander media 3 is unavailable'
    },
    {
      id: 'broken-external',
      type: 'placeholder',
      label: 'Heartlander media 4 is unavailable'
    }
  ]);
});

test('mount creates accessible ordered slides with safe media presentations', () => {
  const harness = createMountHarness();
  const product = {
    title: 'Heartlander',
    media: [
      {
        id: 'image',
        type: 'image',
        alt: 'Heartlander image',
        image: { url: 'https://cdn.shopify.com/heartlander.jpg' }
      },
      {
        id: 'video',
        type: 'video',
        alt: 'Heartlander video',
        sources: [{ url: 'https://cdn.shopify.com/heartlander.mp4', mimeType: 'video/mp4' }]
      },
      {
        id: 'external',
        type: 'external-video',
        alt: 'Heartlander tying video',
        embedUrl: 'https://www.youtube-nocookie.com/embed/heartlander'
      },
      {
        id: 'model',
        type: 'model-3d',
        alt: 'Heartlander model',
        sources: [{ url: 'https://cdn.shopify.com/heartlander.glb' }]
      },
      {
        id: 'unsupported',
        type: 'audio',
        alt: 'Heartlander audio'
      },
      {
        id: 'broken-video',
        type: 'video',
        sources: []
      }
    ]
  };

  const gallery = withDocument(harness.document, () => (
    homepageGallery.mount(harness.card, product)
  ));

  assert.equal(gallery.items.length, 6);
  assert.equal(harness.track.children.length, 6);
  assert.deepEqual(
    harness.track.children.map((slide) => slide.getAttribute('aria-label')),
    [
      '1 of 6: Heartlander image',
      '2 of 6: Heartlander video',
      '3 of 6: Heartlander tying video',
      '4 of 6: Heartlander model',
      '5 of 6: Heartlander audio is unavailable',
      '6 of 6: Heartlander media 6 is unavailable'
    ]
  );
  assert.equal(harness.track.children[0].children[0].tagName, 'BUTTON');
  assert.equal(harness.track.children[0].querySelectorAll('[data-drop-zoom-open]').length, 1);
  assert.equal(harness.track.children[1].children[0].tagName, 'VIDEO');
  assert.equal(harness.track.children[2].children[0].tagName, 'IFRAME');
  assert.equal(harness.track.children[3].children[0].tagName, 'A');
  assert.equal(harness.track.children[3].children[0].textContent, 'View 3D model');
  assert.equal(harness.track.children[3].children[0].getAttribute('aria-label'), 'Heartlander model');
  assert.equal(harness.track.children[3].children[0].href, 'https://cdn.shopify.com/heartlander.glb');
  assert.equal(harness.track.children[3].querySelectorAll('[data-drop-zoom-open]').length, 0);
  assert.equal(harness.track.children[4].children[0].tagName, 'DIV');
  assert.equal(
    harness.track.children[4].children[0].className,
    'product-media-placeholder generic-media-placeholder'
  );
  assert.equal(harness.track.children[4].children[0].textContent, 'Heartlander audio is unavailable');
  assert.equal(harness.track.children[4].querySelectorAll('[data-drop-zoom-open]').length, 0);
  assert.equal(harness.track.children[5].children[0].tagName, 'DIV');
  assert.equal(harness.track.children[5].children[0].textContent, 'Heartlander media 6 is unavailable');
  assert.equal(harness.track.children[5].querySelectorAll('[data-drop-zoom-open]').length, 0);
  assert.equal(harness.counter.textContent, '1 / 6');
  assert.equal(harness.track.children[0].hidden, false);
  assert.equal(harness.track.children[1].hidden, true);
  gallery.show(4);
  assert.equal(harness.counter.textContent, '5 / 6');
  assert.equal(harness.track.children[4].hidden, false);
  assert.equal(harness.track.children[0].hidden, true);
  gallery.show(5);
  assert.equal(harness.counter.textContent, '6 / 6');
  assert.equal(harness.track.children[5].hidden, false);
});

test('mounted controls and keyboard wrap while pausing video only when it becomes inactive', () => {
  const harness = createMountHarness();
  const product = {
    title: 'Heartlander',
    media: [
      {
        id: 'first',
        type: 'image',
        alt: 'Heartlander first image',
        image: { url: 'https://cdn.shopify.com/first.jpg' }
      },
      {
        id: 'video',
        type: 'video',
        alt: 'Heartlander video',
        sources: [{ url: 'https://cdn.shopify.com/heartlander.mp4' }]
      },
      {
        id: 'last',
        type: 'image',
        alt: 'Heartlander last image',
        image: { url: 'https://cdn.shopify.com/last.jpg' }
      }
    ]
  };

  const gallery = withDocument(harness.document, () => (
    homepageGallery.mount(harness.card, product)
  ));
  const video = harness.track.children[1].querySelector('video');

  assert.equal(video.pauseCalls, 0);
  harness.next.dispatch('click');
  assert.equal(gallery.getIndex(), 1);
  assert.equal(harness.counter.textContent, '2 / 3');
  assert.equal(harness.track.children[1].hidden, false);
  harness.next.dispatch('click');
  assert.equal(gallery.getIndex(), 2);
  assert.equal(video.pauseCalls, 1);
  harness.next.dispatch('click');
  assert.equal(gallery.getIndex(), 0);
  harness.previous.dispatch('click');
  assert.equal(gallery.getIndex(), 2);

  harness.card.dispatch('keydown', { key: 'ArrowLeft' });
  assert.equal(gallery.getIndex(), 1);
  harness.card.dispatch('keydown', { key: 'ArrowLeft' });
  assert.equal(gallery.getIndex(), 0);
  assert.equal(video.pauseCalls, 2);
  harness.card.dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(gallery.getIndex(), 1);
  assert.equal(harness.counter.textContent, '2 / 3');
});

test('single fallback media disables unusable navigation without removing the product card', () => {
  const harness = createMountHarness();
  const fallback = {
    src: 'assets/img/products/heartlander.jpg',
    alt: 'Heartlander fallback image'
  };

  const gallery = withDocument(harness.document, () => (
    homepageGallery.mount(harness.card, { title: 'Heartlander', media: [] }, fallback)
  ));

  assert.equal(harness.card.hidden, false);
  assert.equal(gallery.items.length, 1);
  assert.equal(gallery.items[0].id, 'fallback-image');
  assert.equal(harness.track.children.length, 1);
  assert.equal(harness.track.children[0].getAttribute('aria-label'), '1 of 1: Heartlander fallback image');
  assert.equal(harness.track.children[0].querySelectorAll('[data-drop-zoom-open]').length, 1);
  assert.equal(harness.previous.disabled, true);
  assert.equal(harness.next.disabled, true);
  assert.equal(harness.counter.textContent, '1 / 1');
});

test('single unsupported media fallback stays visible with disabled navigation and no zoom', () => {
  const harness = createMountHarness();

  const gallery = withDocument(harness.document, () => (
    homepageGallery.mount(harness.card, {
      title: 'Heartlander',
      media: [{ id: 'unsupported', type: 'audio' }]
    })
  ));

  assert.equal(harness.card.hidden, false);
  assert.equal(gallery.items.length, 1);
  assert.deepEqual(gallery.items[0], {
    id: 'unsupported',
    type: 'placeholder',
    label: 'Heartlander media 1 is unavailable'
  });
  assert.equal(harness.track.children.length, 1);
  assert.equal(harness.track.children[0].getAttribute('aria-label'), '1 of 1: Heartlander media 1 is unavailable');
  assert.equal(harness.track.children[0].children[0].tagName, 'DIV');
  assert.equal(
    harness.track.children[0].children[0].className,
    'product-media-placeholder generic-media-placeholder'
  );
  assert.equal(harness.track.children[0].children[0].textContent, 'Heartlander media 1 is unavailable');
  assert.equal(harness.track.children[0].querySelectorAll('[data-drop-zoom-open]').length, 0);
  assert.equal(harness.previous.disabled, true);
  assert.equal(harness.next.disabled, true);
  assert.equal(harness.counter.textContent, '1 / 1');
});

test('missing media and fallback leave the existing product-card presentation intact', () => {
  const harness = createMountHarness();
  const existingSlide = harness.track.children[0];

  const gallery = withDocument(harness.document, () => (
    homepageGallery.mount(harness.card, { title: 'Heartlander', media: [] })
  ));

  assert.equal(gallery, null);
  assert.equal(harness.card.hidden, false);
  assert.equal(harness.track.children.length, 1);
  assert.equal(harness.track.children[0], existingSlide);
});

test('homepage limited-drop gallery wraps previous and next navigation', () => {
  assert.equal(homepageGallery.nextIndex(0, 5, -1), 4);
  assert.equal(homepageGallery.nextIndex(4, 5, 1), 0);
  assert.equal(homepageGallery.nextIndex(2, 5, 1), 3);
  assert.equal(homepageGallery.nextIndex(0, 0, 1), 0);
});
