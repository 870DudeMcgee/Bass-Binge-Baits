'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const homepageGallery = require('../assets/js/limited-drop-gallery.js');

test('homepage limited-drop gallery preserves every ordered Shopify image and video', () => {
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
        id: 'detail',
        type: 'image',
        alt: 'Heartlander detail view',
        image: { url: 'https://cdn.shopify.com/heartlander-detail.jpg' }
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
      id: 'detail',
      type: 'image',
      label: 'Heartlander detail view',
      src: 'https://cdn.shopify.com/heartlander-detail.jpg'
    }
  ]);
});

test('homepage limited-drop gallery wraps previous and next navigation', () => {
  assert.equal(homepageGallery.nextIndex(0, 5, -1), 4);
  assert.equal(homepageGallery.nextIndex(4, 5, 1), 0);
  assert.equal(homepageGallery.nextIndex(2, 5, 1), 3);
  assert.equal(homepageGallery.nextIndex(0, 0, 1), 0);
});
