# Bass Binge Production Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current Bass Binge static storefront safe and polished enough for a production release by fixing checkout dead ends, contact behavior, mobile layout, cart usability, marketing clarity, and launch metadata.

**Architecture:** Keep the site as plain static HTML, CSS, and JavaScript. Use the existing catalog/cart modules as the source of truth, add stronger release validation scripts, and tighten shared page chrome manually before considering a build system.

**Tech Stack:** Static HTML, CSS custom properties, plain browser JavaScript, Node validation scripts, Vercel static deployment.

---

## Current Evidence

Use these facts as the baseline:

- `node scripts/validate-catalog.js` currently passes, but it only validates catalog shape and image paths.
- A rendered Chrome audit found `38 / 60` selectable Jig Builds without checkout mappings.
- Adding the shop default `1/2 PeeWee Football HD` Fruit Fly selection puts 1 item in cart, then leaves checkout disabled with `href="#"`.
- Submitting the contact form shows: `Thanks for reaching out. This demo form is in placeholder mode; hook it to your preferred endpoint next.`
- Headless Chrome saw `/favicon.ico` return 404.
- Product pages include cart drawer markup but do not include a visible nav cart opener.
- The home first viewport is mostly text and brand badges, not product proof.
- Product pages have the best interaction polish, but mobile gallery and option controls are crowded.

## Release Spec

### P0: Buying Flow Safety

Production release must not let a shopper add a normal-looking option that cannot reach checkout.

Acceptance criteria:

- Every option that can be added to cart has a valid `build.isCheckoutable === true`.
- Unmapped color, weight, or rattle combinations are visibly disabled before add-to-cart.
- Cart checkout blocking remains as a defensive fallback.
- The shop page defaults to a checkoutable color for every card.
- Product pages show clear inline copy when a selected build is not available for online checkout.
- A release audit script fails if any rendered add-to-cart default is uncheckoutable.

### P0: Contact Flow Honesty

Production release must not expose demo/placeholder form behavior.

Acceptance criteria:

- Contact submit no longer contains the words `demo`, `placeholder`, or `hook it`.
- The first production pass uses the published email address as a mailto fallback.
- Form fields are included in the generated email body.
- The customer sees honest copy: `Opening your email app...` or a visible direct email fallback.

### P1: Mobile Usability

Production release must be usable at 390px width without clipped primary copy or tiny critical controls.

Acceptance criteria:

- Home, shop, contact, about, and every product page have `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1` at 390px.
- Primary text fits inside its container on home and shop.
- Product gallery arrow and zoom buttons are at least 44px by 44px on touch viewports.
- Mobile product pages keep add-to-cart reachable without unnecessary visual noise.

### P1: Cart Access

Production release must let customers reopen the cart from every commerce page.

Acceptance criteria:

- Product page headers include the same cart button pattern as `shop.html`.
- Cart count updates on product pages after add-to-cart.
- Closing the drawer does not trap the shopper; they can reopen it from nav.

### P1: Marketing and Design Polish

Production release should feel like a real bait brand, not a static placeholder.

Acceptance criteria:

- Home hero shows an actual lure/product image in the first viewport.
- Home headline is concrete and buyer-focused.
- Repeated generic copy is reduced.
- Shop cards give faster decision help: best use, cover/structure, weight, and checkout availability.
- At least one brand-specific micro-interaction is added without layout shift: swatch/photo transition, add-to-cart feedback, or product-card hover motion.

### P2: Launch Metadata

Production release should be crawlable and shareable.

Acceptance criteria:

- All pages include a favicon link that stops `/favicon.ico` 404 requests.
- `sitemap.xml` includes all four product pages.
- Each page has a useful `og:image`.
- Canonical domain uses the same domain as `robots.txt` and `sitemap.xml` unless the user provides a different final domain.

### P2: Maintainability

Production release should not make future page edits fragile.

Acceptance criteria:

- Repeated inline styles are moved into CSS classes.
- Page shell drift is reduced at least for cart button/header scripts.
- Any broader template/build step is deferred unless required by the user.

## File Structure

Modify:

- `assets/js/catalog.js`: add availability helpers and optionally `onlineAvailable` flags when Shopify mapping is absent.
- `assets/js/cart-checkout.js`: keep defensive checkout gating; add no new checkout bypass.
- `assets/js/shop.js`: choose checkoutable defaults and disable unmapped options before cart.
- `assets/js/product-page.js`: disable add-to-cart for unmapped selections; show availability messaging; update touch target behavior if needed.
- `assets/js/main.js`: replace demo contact submit with mailto fallback.
- `assets/css/styles.css`: mobile hero/shop fixes, cart button reuse, home hero product styling, no inline style replacements.
- `assets/css/product.css`: mobile gallery touch targets and option grid polish.
- `index.html`: home hero product proof, sharper copy, favicon/OG metadata.
- `shop.html`: shop decision-support copy, relative product links, favicon/OG metadata.
- `about.html`: favicon/OG metadata and inline style cleanup.
- `contact.html`: production contact wording, favicon/OG metadata, inline style cleanup.
- `products/*.html`: product nav cart opener, favicon/OG metadata, copy typo cleanup.
- `sitemap.xml`: add product URLs.
- `README.md`: document release validation commands.

Create:

- `scripts/audit-release.js`: Node release audit for checkoutability, demo strings, sitemap coverage, metadata basics.

Do not create:

- A frontend framework.
- A server-side contact endpoint without the user's provider/API credentials.
- A build system in this pass.

## Tasks

### Task 1: Add A Release Audit Script

**Files:**

- Create: `scripts/audit-release.js`
- Modify: `README.md`

- [ ] **Step 1: Create the release audit script**

Add `scripts/audit-release.js` with this structure:

```js
#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../assets/js/catalog.js');

const root = path.resolve(__dirname, '..');
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function assertNoDemoContactCopy() {
  const files = ['assets/js/main.js', 'contact.html'];
  const banned = /\b(demo|placeholder|hook it)\b/i;

  files.forEach((file) => {
    const source = read(file);
    if (banned.test(source)) {
      fail(`${file} still contains demo/placeholder contact copy`);
    }
  });
}

function assertShopDefaultsCheckoutable() {
  catalog.listProducts().forEach((product) => {
    const build = catalog.getJigBuild({
      productKey: product.key,
      colorKey: product.defaultColorKey,
      weightKey: product.defaultWeightKey,
      rattleKey: product.rattle && product.rattle.defaultKey ? product.rattle.defaultKey : 'no'
    });

    if (!build || !build.isCheckoutable) {
      fail(`${product.title} default build is not checkoutable`);
    }
  });
}

function assertFaviconLinks() {
  const pages = [
    'index.html',
    'shop.html',
    'about.html',
    'contact.html',
    'products/peewee-football.html',
    'products/peewee-football-hd.html',
    'products/peewee-spider-hd.html',
    'products/heavy-cover-football.html'
  ];

  pages.forEach((page) => {
    const source = read(page);
    if (!/rel="icon"/.test(source)) {
      fail(`${page} is missing a favicon link`);
    }
    if (!/property="og:image"/.test(source)) {
      fail(`${page} is missing og:image`);
    }
  });
}

function assertSitemapProducts() {
  const sitemap = read('sitemap.xml');
  catalog.listProducts().forEach((product) => {
    if (!sitemap.includes(product.pagePath)) {
      fail(`sitemap.xml is missing ${product.pagePath}`);
    }
  });
}

assertNoDemoContactCopy();
assertShopDefaultsCheckoutable();
assertFaviconLinks();
assertSitemapProducts();

if (failures.length) {
  console.error('Release audit failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('Release audit passed.');
```

- [ ] **Step 2: Run the new audit and confirm it fails before fixes**

Run:

```bash
node scripts/audit-release.js
```

Expected: FAIL, listing contact placeholder copy, default uncheckoutable builds, missing favicon links, missing `og:image`, and missing product sitemap entries.

- [ ] **Step 3: Document validation commands**

Add this to `README.md` under catalog validation:

```md
Run both checks before release:

```bash
node scripts/validate-catalog.js
node scripts/audit-release.js
```
```

- [ ] **Step 4: Commit**

```bash
git add scripts/audit-release.js README.md
git commit -m "chore: add production release audit"
```

### Task 2: Prevent Uncheckoutable Adds

**Files:**

- Modify: `assets/js/catalog.js`
- Modify: `assets/js/shop.js`
- Modify: `assets/js/product-page.js`
- Modify: `assets/css/styles.css`
- Modify: `assets/css/product.css`

- [ ] **Step 1: Add catalog helpers**

In `assets/js/catalog.js`, add helpers near `getCheckoutMapping`:

```js
function isBuildCheckoutable(selection) {
  var build = getJigBuild(selection);
  return Boolean(build && build.isCheckoutable);
}

function firstCheckoutableColor(product, weightKey, rattleKey) {
  if (!product) return null;

  return product.colors.find(function (color) {
    return isBuildCheckoutable({
      productKey: product.key,
      colorKey: color.key,
      weightKey: weightKey || product.defaultWeightKey,
      rattleKey: rattleKey || (product.rattle && product.rattle.defaultKey) || 'no'
    });
  }) || null;
}
```

Export both helpers in the `api` object.

- [ ] **Step 2: Make shop defaults checkoutable**

In `assets/js/shop.js`, change default color selection so it prefers `catalog.firstCheckoutableColor(product, product.defaultWeightKey, 'no')` before `product.defaultColorKey`.

Use this behavior:

```js
var defaultColor = catalog.firstCheckoutableColor(product, product.defaultWeightKey, 'no') ||
  catalog.getColor(product, product.defaultColorKey) ||
  product.colors[0];
select.value = defaultColor.key;
```

- [ ] **Step 3: Disable unmapped shop color swatches/options**

When building each shop swatch and option, compute checkoutability:

```js
var isCheckoutable = catalog.isBuildCheckoutable({
  productKey: product.key,
  colorKey: color.key,
  weightKey: product.defaultWeightKey,
  rattleKey: 'no'
});

option.disabled = !isCheckoutable;
swatch.disabled = !isCheckoutable;
swatch.classList.toggle('is-unavailable', !isCheckoutable);
swatch.title = isCheckoutable ? color.name : color.name + ' is not available for online checkout yet';
```

In `updateSelectedProduct`, disable the add button when `!build || !build.isCheckoutable` and set button text to `Unavailable Online` for unavailable builds.

- [ ] **Step 4: Add product page availability message**

In `products/*.html`, add this after each price display:

```html
<p class="product-availability" data-product-availability></p>
```

In `assets/js/product-page.js`, select it:

```js
var availabilityNode = document.querySelector('[data-product-availability]');
```

Update `updatePrice()` so the add button is disabled when selected build is not checkoutable:

```js
function updatePrice() {
  var build = selectedBuild();
  if (!build) return;

  if (priceDisplay) {
    priceDisplay.textContent = catalog ? catalog.formatMoney(build.price) : '$' + build.price.toFixed(2);
  }

  if (availabilityNode) {
    availabilityNode.textContent = build.isCheckoutable
      ? 'Available for secure online checkout.'
      : 'This option is not available for online checkout yet. Choose another option or contact us for availability.';
    availabilityNode.classList.toggle('is-unavailable', !build.isCheckoutable);
  }

  if (addCartBtn) {
    addCartBtn.disabled = !build.isCheckoutable;
    addCartBtn.textContent = build.isCheckoutable ? 'Add to Cart' : 'Unavailable Online';
  }
}
```

- [ ] **Step 5: Add unavailable styles**

In `assets/css/styles.css`:

```css
.swatch-button.is-unavailable,
.swatch-button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
  transform: none;
}
```

In `assets/css/product.css`:

```css
.product-availability {
  margin: 0;
  color: var(--sage);
  font-weight: 700;
}

.product-availability.is-unavailable {
  color: var(--rust);
}
```

- [ ] **Step 6: Verify**

Run:

```bash
node scripts/validate-catalog.js
node scripts/audit-release.js
```

Expected: `validate-catalog.js` passes. `audit-release.js` may still fail for metadata/contact until later tasks, but should no longer fail for default uncheckoutable builds.

- [ ] **Step 7: Commit**

```bash
git add assets/js/catalog.js assets/js/shop.js assets/js/product-page.js assets/css/styles.css assets/css/product.css products/*.html
git commit -m "fix: prevent uncheckoutable cart additions"
```

### Task 3: Replace Demo Contact Behavior

**Files:**

- Modify: `assets/js/main.js`
- Modify: `contact.html`

- [ ] **Step 1: Replace the submit handler**

Change the contact form handler in `assets/js/main.js` to:

```js
if (contactForm && formNote) {
  contactForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const formData = new FormData(contactForm);
    const subject = encodeURIComponent('Bass Binge contact: ' + (formData.get('topic') || 'Product Question'));
    const body = encodeURIComponent(
      [
        'Name: ' + (formData.get('name') || ''),
        'Email: ' + (formData.get('email') || ''),
        'Phone: ' + (formData.get('phone') || ''),
        'Topic: ' + (formData.get('topic') || ''),
        '',
        String(formData.get('message') || '')
      ].join('\n')
    );

    formNote.textContent = 'Opening your email app. You can also email hello@bassbingejigs.com directly.';
    window.location.href = 'mailto:hello@bassbingejigs.com?subject=' + subject + '&body=' + body;
  });
}
```

- [ ] **Step 2: Tighten contact page copy**

In `contact.html`, change the intro paragraph to:

```html
<p>
  Send your fishery, target cover, and preferred colors. We will help match a jig profile to how you fish.
</p>
```

Add helper copy under the button:

```html
<p class="form-helper" data-form-note>Email opens in your mail app so your message goes straight to Bass Binge.</p>
```

Remove the empty `style="margin-bottom: 0"` note paragraph.

- [ ] **Step 3: Verify**

Run:

```bash
node scripts/audit-release.js
```

Expected: no contact placeholder/demo failure remains.

- [ ] **Step 4: Commit**

```bash
git add assets/js/main.js contact.html
git commit -m "fix: replace demo contact form behavior"
```

### Task 4: Add Cart Access To Product Pages

**Files:**

- Modify: `products/peewee-football.html`
- Modify: `products/peewee-football-hd.html`
- Modify: `products/peewee-spider-hd.html`
- Modify: `products/heavy-cover-football.html`

- [ ] **Step 1: Copy the nav cart button pattern**

In each product page, add this button inside `<nav class="nav-links" data-nav-links>` after Contact:

```html
<button class="nav-cart-button" type="button" data-cart-open aria-label="Open cart">
  <svg aria-hidden="true" viewBox="0 0 24 24">
    <path d="M6.2 6.4h15l-1.8 8.1H8L6.2 3.8H3" />
    <circle cx="9.2" cy="19.2" r="1.4" />
    <circle cx="18" cy="19.2" r="1.4" />
  </svg>
  <span>Cart</span>
  <span class="cart-count" data-cart-count>0</span>
</button>
```

- [ ] **Step 2: Verify manually**

Run:

```bash
python3 -m http.server 8081
```

Open:

```text
http://localhost:8081/products/peewee-football.html
```

Expected:

- Cart button appears in desktop nav.
- Cart button appears inside mobile nav drawer.
- Add a checkoutable item, close drawer, reopen drawer from nav.

Stop the server after verification.

- [ ] **Step 3: Commit**

```bash
git add products/*.html
git commit -m "fix: add product page cart access"
```

### Task 5: Fix Mobile Layout And Touch Targets

**Files:**

- Modify: `assets/css/styles.css`
- Modify: `assets/css/product.css`

- [ ] **Step 1: Add hard mobile containment**

In `assets/css/styles.css`, add:

```css
.hero-grid,
.shop-tools,
.product-card,
.contact-card,
.story-card,
.feature-card {
  min-width: 0;
}

.hero h1,
.section-title,
.product-card h3 {
  max-width: 100%;
  overflow-wrap: anywhere;
}
```

- [ ] **Step 2: Reduce mobile hero crowding**

In the existing `@media (max-width: 520px)` block, update:

```css
.hero h1 {
  font-size: clamp(2rem, 9vw, 2.55rem);
}

.hero p {
  max-width: 100%;
}

.hero-badge {
  align-items: flex-start;
  padding: 0.9rem;
}
```

- [ ] **Step 3: Increase product gallery touch targets**

In `assets/css/product.css`, add inside the existing `@media (max-width: 640px)` block or create one:

```css
@media (max-width: 640px) {
  .product-gallery-arrow,
  .product-gallery-zoom-toggle {
    width: 44px;
    height: 44px;
  }

  .product-gallery-arrow.prev {
    left: 8px;
  }

  .product-gallery-arrow.next {
    right: 8px;
  }

  .product-gallery-thumbs {
    max-width: 100%;
    grid-auto-columns: minmax(82px, 92px);
  }
}
```

- [ ] **Step 4: Verify with Chrome screenshots**

Run:

```bash
python3 -m http.server 8081
```

In another terminal, run:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-first-run --user-data-dir=/tmp/bass-binge-mobile-check --window-size=390,844 --screenshot=/tmp/bass-binge-mobile-check.png http://localhost:8081/index.html
```

Also check:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-first-run --user-data-dir=/tmp/bass-binge-product-mobile-check --window-size=390,844 --screenshot=/tmp/bass-binge-product-mobile-check.png http://localhost:8081/products/peewee-football.html
```

Expected: primary text and controls do not clip at the right edge.

Stop the server after verification.

- [ ] **Step 5: Commit**

```bash
git add assets/css/styles.css assets/css/product.css
git commit -m "fix: tighten mobile layout"
```

### Task 6: Improve Home And Shop Marketing

**Files:**

- Modify: `index.html`
- Modify: `shop.html`
- Modify: `assets/css/styles.css`

- [ ] **Step 1: Add product proof to home hero**

In `index.html`, change the hero grid to two children: copy plus product media. Keep the existing copy child and add this sibling:

```html
<article class="hero-product reveal" aria-label="Featured Bass Binge jig">
  <img src="assets/img/products/pwf-716-a-little-lit.jpg" alt="Bass Binge PeeWee Football Jig in Blackberry Smoothie" />
  <div class="hero-product-copy">
    <span>Featured Jig</span>
    <strong>7/16 oz PeeWee Football</strong>
  </div>
</article>
```

Update the hero headline to:

```html
<h1>Small-batch jigs for rock, docks, brush, and deep structure.</h1>
```

Update the paragraph under origin to:

```html
<p>
  Football and spider profiles tied in Bull Shoals with Jewel Bait jigheads, custom skirts, and colorways built for pressured bass.
</p>
```

- [ ] **Step 2: Restore responsive hero grid**

In `assets/css/styles.css`, update `.hero-grid`:

```css
.hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(280px, 0.75fr);
  gap: clamp(var(--space-4), 5vw, var(--space-7));
  align-items: center;
}
```

Inside `@media (max-width: 900px)`, keep `.hero-grid { grid-template-columns: 1fr; }`.

- [ ] **Step 3: Tighten shop intro**

In `shop.html`, replace the intro paragraph with:

```html
<p>
  Pick a profile, choose a checkout-ready color, and build your box before Shopify handles secure payment, shipping, tax, and order confirmation.
</p>
```

Change product card descriptions to specific buyer help:

```html
<p>Finesse spider profile for brush, rock, and pressured fish when you still need heavier hook confidence.</p>
```

```html
<p>Compact HD football profile for bottom contact, harder hooksets, and tight cover around rock or docks.</p>
```

```html
<p>Full-size football jig for deeper structure, heavy cover, and stained-water presentations.</p>
```

```html
<p>Finesse football jig for dragging ledges, hard spots, and transitions without overpowering pressured bass.</p>
```

- [ ] **Step 4: Add subtle product-card motion**

In `assets/css/styles.css`, extend `.product-card`:

```css
.product-card {
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
}

.product-card:hover {
  border-color: rgba(176, 99, 63, 0.24);
  box-shadow: 0 16px 34px rgba(17, 40, 59, 0.14);
  transform: translateY(-3px);
}

@media (prefers-reduced-motion: reduce) {
  .product-card,
  .btn,
  .reveal {
    transition: none;
  }

  .product-card:hover,
  .btn:hover,
  .btn:focus-visible {
    transform: none;
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add index.html shop.html assets/css/styles.css
git commit -m "feat: sharpen storefront marketing"
```

### Task 7: Add Metadata, Sitemap, And Favicon Links

**Files:**

- Modify: `index.html`
- Modify: `shop.html`
- Modify: `about.html`
- Modify: `contact.html`
- Modify: `products/*.html`
- Modify: `sitemap.xml`

- [ ] **Step 1: Add favicon and OG image to root pages**

For root pages, add in `<head>`:

```html
<link rel="icon" href="assets/img/bass-binge-logo.png" type="image/png" />
<meta property="og:image" content="https://www.bassbingejigs.com/assets/img/bass-binge-logo.png" />
```

- [ ] **Step 2: Add favicon and OG image to product pages**

For product pages, add in `<head>`:

```html
<link rel="icon" href="../assets/img/bass-binge-logo.png" type="image/png" />
<meta property="og:image" content="https://www.bassbingejigs.com/assets/img/products/pwf-716-a-little-lit.jpg" />
```

Use a product-specific image per page:

- `products/peewee-football.html`: `pwf-716-a-little-lit.jpg`
- `products/peewee-football-hd.html`: `pwf-hd-12-bad-bo.jpg`
- `products/peewee-spider-hd.html`: `pro-spider-5-16.jpg`
- `products/heavy-cover-football.html`: `heavy-cover-football-3-4.jpg`

- [ ] **Step 3: Update sitemap**

Add product URLs:

```xml
  <url>
    <loc>https://www.bassbingejigs.com/products/peewee-football.html</loc>
  </url>
  <url>
    <loc>https://www.bassbingejigs.com/products/peewee-football-hd.html</loc>
  </url>
  <url>
    <loc>https://www.bassbingejigs.com/products/peewee-spider-hd.html</loc>
  </url>
  <url>
    <loc>https://www.bassbingejigs.com/products/heavy-cover-football.html</loc>
  </url>
```

- [ ] **Step 4: Verify**

Run:

```bash
node scripts/audit-release.js
```

Expected: no favicon, OG image, or sitemap failures remain.

- [ ] **Step 5: Commit**

```bash
git add index.html shop.html about.html contact.html products/*.html sitemap.xml
git commit -m "chore: add release metadata"
```

### Task 8: Remove Inline Style Drift

**Files:**

- Modify: `index.html`
- Modify: `about.html`
- Modify: `contact.html`
- Modify: `shop.html`
- Modify: `assets/css/styles.css`

- [ ] **Step 1: Add utility classes**

In `assets/css/styles.css`, add:

```css
.stack-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.section-tight {
  padding-top: 0;
}

.center-actions {
  margin-top: 1.5rem;
  text-align: center;
}

.form-gap {
  margin-top: 0.75rem;
}

.form-helper {
  margin-bottom: 0;
  color: var(--ink-soft);
  font-size: 0.92rem;
}
```

- [ ] **Step 2: Replace inline styles**

Replace:

- `style="display: flex; gap: 0.75rem; flex-wrap: wrap"` with `class="stack-actions"`.
- `style="padding-top: 0"` on sections with `class="section section-tight"`.
- `style="text-align: center; margin-top: 1.5rem;"` with `class="center-actions"`.
- `style="margin-top: 0.75rem"` form rows with `class="form-row form-gap"`.
- `style="display: block; margin-top: 0.75rem"` message label with `class="field-label form-gap"`.

- [ ] **Step 3: Verify no inline styles remain on target pages**

Run:

```bash
find . -name '*.html' -print0 | xargs -0 rg -n 'style='
```

Expected: no results, or only intentionally documented one-off art-direction styles. If any remain, move them into named classes.

- [ ] **Step 4: Commit**

```bash
git add index.html about.html contact.html shop.html assets/css/styles.css
git commit -m "refactor: reduce inline style drift"
```

### Task 9: Full Release Verification

**Files:**

- No planned edits unless verification reveals a defect.

- [ ] **Step 1: Run static checks**

```bash
node scripts/validate-catalog.js
node scripts/audit-release.js
```

Expected:

```text
Catalog validation passed for 4 products.
Release audit passed.
```

- [ ] **Step 2: Run local server**

```bash
python3 -m http.server 8081
```

- [ ] **Step 3: Manual desktop smoke test**

Open `http://localhost:8081`.

Check:

- Home hero shows product proof.
- Shop search and filters still work.
- Every enabled shop Add to Cart opens drawer and produces a checkout URL.
- Product pages can add checkoutable selections and reopen cart from header.
- Unavailable product selections cannot be added.
- Contact submit opens an email draft.

- [ ] **Step 4: Manual mobile smoke test**

Use Chrome device toolbar at 390px width.

Check:

- No clipped home/shop headline text.
- Mobile nav opens and includes Cart on commerce pages.
- Product gallery controls are easy to tap.
- Add-to-cart and checkout remain reachable.

- [ ] **Step 5: Capture final screenshots**

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-first-run --user-data-dir=/tmp/bass-binge-final-home --window-size=1440,1000 --screenshot=/tmp/bass-binge-final-home.png http://localhost:8081/index.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-first-run --user-data-dir=/tmp/bass-binge-final-shop-mobile --window-size=390,844 --screenshot=/tmp/bass-binge-final-shop-mobile.png http://localhost:8081/shop.html
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-first-run --user-data-dir=/tmp/bass-binge-final-product-mobile --window-size=390,844 --screenshot=/tmp/bass-binge-final-product-mobile.png http://localhost:8081/products/peewee-football.html
```

- [ ] **Step 6: Stop local server**

Press `Ctrl-C` in the server terminal.

- [ ] **Step 7: Commit final verification/doc updates**

```bash
git status --short
git add README.md docs/superpowers/plans/2026-06-11-production-release-hardening.md
git commit -m "docs: add production hardening plan"
```

Skip this commit if the plan was committed earlier.

## Self-Review

Spec coverage:

- P0 buying flow is covered by Tasks 1 and 2.
- P0 contact flow is covered by Task 3.
- P1 mobile usability is covered by Task 5.
- P1 cart access is covered by Task 4.
- P1 marketing/design polish is covered by Task 6.
- P2 launch metadata is covered by Task 7.
- P2 maintainability is covered by Task 8.
- Full verification is covered by Task 9.

Known constraint:

- The next agent cannot invent missing Shopify variant IDs. This plan makes production safe by disabling unmapped options and preferring checkoutable defaults. If the user provides the missing Shopify variant data, the next agent should add those mappings to `assets/js/catalog.js` and let the release audit verify the result.
