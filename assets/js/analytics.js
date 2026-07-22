(function (root) {
  'use strict';

  var allowedEvents = [
    'view_item_list',
    'view_item',
    'add_to_cart',
    'remove_from_cart',
    'view_cart',
    'begin_checkout',
    'generate_lead'
  ];

  function itemFromBuild(build, quantity) {
    if (!build) return null;

    return {
      item_id: String(build.productKey || build.id || ''),
      item_name: String(build.productTitle || ''),
      item_variant: [build.colorName, build.weightLabel, build.rattleLabel]
        .filter(Boolean)
        .join(' / '),
      price: Number(build.price || 0),
      quantity: Math.max(1, Number(quantity) || 1)
    };
  }

  function payloadForItems(items) {
    var cleanItems = items.filter(Boolean);
    return {
      currency: 'USD',
      value: cleanItems.reduce(function (total, item) {
        return total + (Number(item.price) * Number(item.quantity));
      }, 0),
      items: cleanItems
    };
  }

  function send(eventName, parameters, callback) {
    if (allowedEvents.indexOf(eventName) === -1 || typeof root.gtag !== 'function') {
      if (typeof callback === 'function') callback();
      return;
    }

    var payload = Object.assign({}, parameters || {});
    if (typeof callback === 'function') {
      payload.event_callback = callback;
      payload.event_timeout = 900;
    }
    root.gtag('event', eventName, payload);
  }

  function trackBuild(eventName, build, quantity) {
    send(eventName, payloadForItems([itemFromBuild(build, quantity)]));
  }

  function trackLines(eventName, lines, callback) {
    var items = (lines || []).map(function (line) {
      return itemFromBuild(line.build, line.quantity);
    });
    send(eventName, payloadForItems(items), callback);
  }

  root.BassBingeAnalytics = {
    itemFromBuild: itemFromBuild,
    send: send,
    trackBuild: trackBuild,
    trackLines: trackLines
  };
})(window);
