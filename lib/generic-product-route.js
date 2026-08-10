'use strict';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textFromHtml(value) {
  return String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function correctJewelSpelling(value) {
  return String(value || '').replace(/\bJewell\b/gi, 'Jewel');
}

function findProductByHandle(catalog, handle) {
  if (!catalog || catalog.schemaVersion !== 2 || !Array.isArray(catalog.products)) {
    return null;
  }
  return catalog.products.find((product) =>
    product &&
    product.handle === handle &&
    (!product.presentation || product.presentation.kind !== 'hidden-add-on')
  ) || null;
}

function firstImage(product) {
  return (Array.isArray(product.media) ? product.media : []).find((item) =>
    item && item.type === 'image' && item.image && item.image.url
  ) || null;
}

function renderGenericProductPage(product) {
  const displayProduct = {
    ...product,
    title: correctJewelSpelling(product.title),
    descriptionHtml: correctJewelSpelling(product.descriptionHtml)
  };
  const description = textFromHtml(displayProduct.descriptionHtml);
  const image = firstImage(displayProduct);
  const productJson = JSON.stringify(displayProduct)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const canonical = `https://www.bassbingebaits.com/products/${encodeURIComponent(displayProduct.handle)}`;
  const jewelCrawBranding = displayProduct.handle === 'chopped-craw-6-pack'
    ? `<div class="product-co-brand">
              <img src="/assets/img/jewel-bait-logo.png" alt="Jewel Bait Company" />
              <div>
                <strong>Jewel Finesse Craw</strong>
                <span class="co-brand-detail">Made by Jewel Bait Company for finesse presentations</span>
              </div>
            </div>`
    : '';
  const imageMeta = image
    ? `<meta property="og:image" content="${escapeHtml(image.image.url)}" />`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(displayProduct.title)} | Bass Binge Baits</title>
    <meta name="description" content="${escapeHtml(description.slice(0, 160) || displayProduct.title)}" />
    <meta property="og:title" content="${escapeHtml(displayProduct.title)} | Bass Binge Baits" />
    <meta property="og:description" content="${escapeHtml(description.slice(0, 200) || displayProduct.title)}" />
    <meta property="og:type" content="product" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:url" content="${canonical}" />
    ${imageMeta}
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" href="/assets/img/favicon-32.png" type="image/png" sizes="32x32" />
    <link rel="icon" href="/assets/img/favicon.png" type="image/png" sizes="512x512" />
    <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png" sizes="180x180" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Alegreya:wght@600;700;800&family=Barlow:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/assets/css/styles.css?v=20260719-androidnav" />
    <link rel="stylesheet" href="/assets/css/product.css?v=20260727-product-reset" />
  </head>
  <body data-generic-product>
    <header class="site-header">
      <div class="container nav-wrap">
        <a href="/" class="brand" aria-label="Bass Binge homepage">
          <img class="brand-logo" src="/assets/img/bass-binge-logo.png?v=20260611" alt="Bass Binge Baits logo" />
          <span><span class="brand-main">Bass Binge</span><span class="brand-sub">Premium Lures</span></span>
        </a>
        <button class="mobile-toggle" data-nav-toggle aria-expanded="false" aria-label="Toggle menu">☰</button>
        <nav class="nav-links" data-nav-links>
          <a href="/">Home</a><a href="/shop">Shop</a><a href="/about">About</a><a href="/contact">Contact</a>
          <button class="nav-cart-button" type="button" data-cart-open aria-label="Open cart">
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6.2 6.4h15l-1.8 8.1H8L6.2 3.8H3" /><circle cx="9.2" cy="19.2" r="1.4" /><circle cx="18" cy="19.2" r="1.4" /></svg>
            <span>Cart</span><span class="cart-count" data-cart-count>0</span>
          </button>
        </nav>
      </div>
    </header>

    <main class="product-page" hidden>
      <div class="container">
        <section class="product-hero">
          <div class="product-hero-left">
            <div class="product-gallery" data-gallery aria-label="${escapeHtml(displayProduct.title)} image gallery">
              <div class="product-gallery-main">
                <div class="product-gallery-track" data-gallery-track></div>
                <button class="product-gallery-arrow prev" type="button" data-gallery-prev aria-label="Previous image">
                  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <button class="product-gallery-arrow next" type="button" data-gallery-next aria-label="Next image">
                  <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>
                </button>
                <span class="product-gallery-counter" data-gallery-counter></span>
              </div>
              <div class="product-gallery-thumbs" data-gallery-thumbs></div>
            </div>
          </div>
          <div class="product-hero-right">
            <p class="section-kicker">${escapeHtml(displayProduct.productType || displayProduct.vendor || 'Bass Binge Baits')}</p>
            <h1 class="product-hero-title">${escapeHtml(displayProduct.title)}</h1>
            <p class="product-hero-price" data-price-display></p>
            <p class="product-availability" data-product-availability aria-live="polite"></p>
            ${description ? `<p class="product-hero-desc">${escapeHtml(description)}</p>` : ''}
            <div data-generic-options></div>
            <div class="product-purchase">
              <div class="quantity-stepper" aria-label="Product quantity">
                <button type="button" data-quantity-decrease aria-label="Decrease quantity">−</button>
                <input type="number" inputmode="numeric" min="1" max="99" value="1" data-quantity-input aria-label="Quantity" />
                <button type="button" data-quantity-increase aria-label="Increase quantity">+</button>
              </div>
              <button class="btn btn-primary" type="button" data-add-cart>Add to Cart</button>
              <a href="/shop" class="btn btn-secondary">View All Products</a>
            </div>
            ${jewelCrawBranding}
          </div>
        </section>
      </div>
    </main>

    <div class="cart-overlay" data-cart-overlay hidden></div>
    <aside class="cart-drawer" data-cart-drawer aria-hidden="true" aria-labelledby="cart-title">
      <div class="cart-drawer-header">
        <div><p class="section-kicker">Checkout</p><h2 id="cart-title">Your Bass Binge Cart</h2></div>
        <button class="icon-button" type="button" data-cart-close aria-label="Close cart">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <div class="cart-drawer-body">
        <div class="cart-empty" data-cart-empty>
          <h3>Your cart is ready when you are.</h3>
          <p>Add a product, then review it here before checkout.</p>
          <button class="btn btn-secondary" type="button" data-cart-close>Keep Shopping</button>
        </div>
        <div class="cart-items" data-cart-items></div>
      </div>
      <div class="cart-drawer-footer">
        <div class="cart-total-row"><span>Subtotal</span><strong data-cart-subtotal>$0.00</strong></div>
        <p class="cart-note">Shipping and taxes are calculated during checkout.</p>
        <a class="btn btn-primary" href="/shop" data-checkout-link>Continue to Checkout</a>
      </div>
    </aside>

    <div class="toast" data-toast role="status" aria-live="polite"></div>
    <footer class="site-footer">
      <div class="container footer-row">
        <div class="footer-left">
          <p>© <span data-year></span> Bass Binge Baits. All rights reserved.</p>
          <p class="footer-origin">Made in Bull Shoals, AR — tested against the hardest water.</p>
        </div>
        <div class="footer-links"><a href="/contact">Contact</a><a href="/about">About</a><a href="/shop">Shop</a><a href="/privacy">Privacy</a></div>
      </div>
    </footer>

    <script id="generic-product-data" type="application/json">${productJson}</script>
    <script src="/assets/js/catalog-taxonomy.js?v=20260802" defer></script>
    <script src="/assets/js/catalog.js?v=20260810-rattle-legacy" defer></script>
    <script src="/assets/js/cart-checkout.js?v=20260727-restored-shell" defer></script>
    <script src="/assets/js/main.js?v=20260722" defer></script>
    <script src="/assets/js/generic-product-page.js?v=20260810-rattle-build" defer></script>
  </body>
</html>`;
}

function renderStatusPage(statusCode, title, message) {
  return `<!doctype html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><meta name="robots" content="noindex" /><title>${escapeHtml(title)} | Bass Binge Baits</title><link rel="stylesheet" href="/assets/css/styles.css" /></head><body><main class="container" style="padding:6rem 1rem"><p class="section-kicker">${statusCode}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a class="btn btn-primary" href="/shop">Back to Shop</a></main></body></html>`;
}

function createGenericProductHandler(dependencies) {
  const getCatalog = dependencies && dependencies.getCatalog;
  if (typeof getCatalog !== 'function') {
    throw new TypeError('createGenericProductHandler requires getCatalog');
  }

  return async function genericProductHandler(request, response) {
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      return response.status(405).send(renderStatusPage(405, 'Method not allowed', 'This product route only supports GET requests.'));
    }

    const rawHandle = request.query && request.query.handle;
    const handle = Array.isArray(rawHandle) ? rawHandle[0] : String(rawHandle || '');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle)) {
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      return response.status(404).send(renderStatusPage(404, 'Product not found', 'This product is not available.'));
    }

    try {
      const catalog = await getCatalog(request);
      const product = findProductByHandle(catalog, handle);
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (!product) {
        response.setHeader('Cache-Control', 'no-store');
        return response.status(404).send(renderStatusPage(404, 'Product not found', 'This product is not available.'));
      }
      response.setHeader('Cache-Control', 'public, s-maxage=5, must-revalidate');
      return response.status(200).send(renderGenericProductPage(product));
    } catch (error) {
      console.error('Generic Shopify product route failed', {
        handle,
        message: error.message,
        details: error.details || null
      });
      response.setHeader('Cache-Control', 'no-store');
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      const statusCode = error.statusCode === 503 ? 503 : 502;
      return response.status(statusCode).send(renderStatusPage(statusCode, 'Product temporarily unavailable', 'Please try again in a moment.'));
    }
  };
}

module.exports = {
  createGenericProductHandler,
  findProductByHandle,
  renderGenericProductPage
};
