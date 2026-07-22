#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function validateAnalyticsHelper() {
  const calls = [];
  const window = {
    gtag(...args) {
      calls.push(args);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/analytics.js'), 'utf8'), { window });

  const build = {
    id: 'peewee-football:fruit-fly:7-16:no',
    productKey: 'peewee-football',
    productTitle: '7/16 oz PeeWee Football Jig',
    colorName: 'Fruit Fly',
    weightLabel: '7/16',
    rattleLabel: 'No',
    price: 5
  };
  window.BassBingeAnalytics.trackBuild('add_to_cart', build, 2);

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'event');
  assert.equal(calls[0][1], 'add_to_cart');
  assert.equal(calls[0][2].currency, 'USD');
  assert.equal(calls[0][2].value, 10);
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0][2].items[0])), {
    item_id: 'peewee-football',
    item_name: '7/16 oz PeeWee Football Jig',
    item_variant: 'Fruit Fly / 7/16 / No',
    price: 5,
    quantity: 2
  });
}

async function validateSuccessfulContactLead() {
  const sentEvents = [];
  let submitHandler;
  let resetCalled = false;
  const submitButton = { disabled: false, textContent: 'Send Message' };
  const formNote = { textContent: '', dataset: {} };
  const contactForm = {
    addEventListener(name, handler) {
      if (name === 'submit') submitHandler = handler;
    },
    querySelector() {
      return submitButton;
    },
    reportValidity() {
      return true;
    },
    reset() {
      resetCalled = true;
    }
  };
  const fields = [
    ['name', 'Customer Name'],
    ['email', 'customer@example.com'],
    ['phone', '555-0100'],
    ['topic', 'Product Question'],
    ['message', 'Sensitive customer message']
  ];
  const document = {
    body: { classList: { add() {}, remove() {} } },
    querySelector(selector) {
      if (selector === '[data-contact-form]') return contactForm;
      if (selector === '[data-form-note]') return formNote;
      return null;
    },
    querySelectorAll() {
      return [];
    }
  };
  const window = {
    BassBingeAnalytics: {
      send(name, payload) {
        sentEvents.push([name, payload]);
      }
    },
    location: { href: '' }
  };
  const context = {
    document,
    window,
    FormData: class {
      entries() {
        return fields[Symbol.iterator]();
      }
      get(name) {
        const field = fields.find(([key]) => key === name);
        return field ? field[1] : null;
      }
    },
    IntersectionObserver: class {
      observe() {}
    },
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
    setTimeout,
    clearTimeout,
    console
  };

  vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/main.js'), 'utf8'), context);
  assert.equal(typeof submitHandler, 'function');
  await submitHandler({ preventDefault() {} });

  assert.equal(resetCalled, true);
  assert.equal(formNote.dataset.state, 'success');
  assert.equal(
    JSON.stringify(sentEvents),
    JSON.stringify([['generate_lead', { lead_source: 'contact_form' }]])
  );
  const serialized = JSON.stringify(sentEvents);
  fields.forEach(([, value]) => assert.equal(serialized.includes(value), false));
}

validateAnalyticsHelper();
validateSuccessfulContactLead()
  .then(() => console.log('Analytics event validation passed.'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
