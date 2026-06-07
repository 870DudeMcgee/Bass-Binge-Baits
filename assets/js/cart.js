/*
 * Bass Binge Cart System
 * Stores cart items in localStorage. No Shopify dependency for browsing.
 * Checkout can be integrated later (Shopify link, PayPal, etc.)
 */

const CART_KEY = 'bassbinge-cart';

const cart = {
  items: [],

  load() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      this.items = raw ? JSON.parse(raw) : [];
    } catch {
      this.items = [];
    }
    this.syncUI();
    return this;
  },

  getItem(id) {
    return this.items.find(i => i.id === id);
  },

  addItem(id, name, color, weight, rattle, price, qty, image) {
    const existing = this.getItem(id);
    if (existing) {
      existing.qty += qty;
    } else {
      this.items.push({ id, name, color, weight, rattle, price, qty, image });
    }
    this.save();
    this.syncUI();
  },

  removeItem(id) {
    this.items = this.items.filter(i => i.id !== id);
    this.save();
    this.syncUI();
  },

  updateQty(id, qty) {
    const item = this.getItem(id);
    if (item) {
      item.qty = qty;
      this.save();
      this.syncUI();
    }
  },

  clear() {
    this.items = [];
    this.save();
    this.syncUI();
  },

  subtotal() {
    return this.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  },

  count() {
    return this.items.reduce((sum, i) => sum + i.qty, 0);
  },

  save() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(this.items)); } catch {}
  },

  syncUI() {
    // Update cart badge counts
    document.querySelectorAll('[data-cart-count]').forEach(el => {
      el.textContent = this.count();
      el.classList.toggle('has-items', this.count() > 0);
    });
    document.querySelectorAll('[data-cart-summary-count]').forEach(el => {
      el.textContent = `${this.count()} item${this.count() !== 1 ? 's' : ''}`;
    });

    // Update cart drawer items list
    const cartItemsEl = document.querySelector('[data-cart-items]');
    const cartEmptyEl = document.querySelector('[data-cart-empty]');
    if (cartItemsEl) {
      if (this.count() === 0) {
        cartItemsEl.innerHTML = '';
        cartEmptyEl?.removeAttribute('hidden');
      } else {
        cartEmptyEl?.setAttribute('hidden', '');
        cartItemsEl.innerHTML = this.items.map(item => `
          <div class="cart-item" data-cart-item-id="${item.id}">
            <img src="${item.image}" alt="${item.name}" />
            <div class="cart-item-main">
              <div class="cart-item-top">
                <h3>${item.name}</h3>
                <span>$${(item.price * item.qty).toFixed(2)}</span>
              </div>
              <p>${item.color} · ${item.weight}${item.rattle ? ' · w/ rattler' : ''}</p>
              <div class="cart-item-actions">
                <div class="quantity-stepper">
                  <button type="button" data-qty-minus="${item.id}">−</button>
                  <span data-qty="${item.id}">${item.qty}</span>
                  <button type="button" data-qty-plus="${item.id}">+</button>
                </div>
                <button type="button" class="text-button" data-cart-remove="${item.id}">Remove</button>
              </div>
            </div>
          </div>
        `).join('');

        // Attach remove buttons
        document.querySelectorAll('[data-cart-remove]').forEach(btn => {
          btn.addEventListener('click', () => {
            cart.removeItem(btn.dataset.cartRemove);
          });
        });

        // Attach qty buttons
        document.querySelectorAll('[data-qty-minus]').forEach(btn => {
          btn.addEventListener('click', () => {
            const item = cart.getItem(btn.dataset.qtyMinus);
            if (item && item.qty > 1) cart.updateQty(item.id, item.qty - 1);
          });
        });
        document.querySelectorAll('[data-qty-plus]').forEach(btn => {
          btn.addEventListener('click', () => {
            const item = cart.getItem(btn.dataset.qtyPlus);
            if (item) cart.updateQty(item.id, item.qty + 1);
          });
        });
      }
    }

    // Update subtotal
    var subtotalEl = document.querySelector('[data-cart-subtotal]');
    if (subtotalEl) subtotalEl.textContent = '$' + this.subtotal().toFixed(2);
  },
};

// Cart drawer toggle
document.querySelectorAll('[data-cart-open]').forEach(btn => {
  btn.addEventListener('click', () => {
    const drawer = document.querySelector('[data-cart-drawer]');
    const overlay = document.querySelector('[data-cart-overlay]');
    if (drawer) drawer.setAttribute('aria-hidden', 'false');
    if (overlay) overlay.removeAttribute('hidden');
    document.body.classList.add('cart-open');
  });
});

document.querySelectorAll('[data-cart-close]').forEach(btn => {
  btn.addEventListener('click', () => {
    const drawer = document.querySelector('[data-cart-drawer]');
    const overlay = document.querySelector('[data-cart-overlay]');
    if (drawer) drawer.setAttribute('aria-hidden', 'true');
    if (overlay) overlay.setAttribute('hidden', '');
    document.body.classList.remove('cart-open');
  });
});

// Init cart on load
cart.load();
