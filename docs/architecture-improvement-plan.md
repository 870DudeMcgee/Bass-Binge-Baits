# Bass Binge Architecture Improvement Plan

Status: implementation started
Date: 2026-06-10
Repository: `/Users/jewelbait/Bass Binge Website`

## Summary

This static storefront is small, but product, cart, and checkout behavior has drifted across several shallow Modules. The main opportunity is to create a deeper Bass Binge Product Catalog Module and make product pages, shop controls, cart state, and Shopify checkout read from it.

No `docs/adr/` existed during review, so there are no ADR conflicts. `CONTEXT.md` was added to name the domain terms used below.

GitHub sync status at review time: local `main` and `origin/main` were both at `bd52494`, and `git pull --ff-only` reported `Already up to date`.

Important worktree note: `assets/js/product-page.js` already had an uncommitted local edit to the gallery `translateX` formula before this document was created. Treat that as existing user work unless the user says otherwise.

Implementation update:

- Added `assets/js/catalog.js` as the Bass Binge Product Catalog Module.
- Added `assets/js/cart-checkout.js` as the unified cart and checkout Module with legacy cart migration and checkout gating for unmapped selections.
- Added `assets/js/shop.js` to enhance shop cards from the catalog.
- Updated product pages to use `data-product-key` and load the catalog/cart Modules.
- Added `scripts/validate-catalog.js`.
- Removed the retired `assets/js/cart.js`, `assets/js/shopify-buy-button.js`, and one-off color image rewrite scripts after replacing their runtime responsibilities.
- Page shell consolidation is still not implemented.

## Findings

### 1. Cart and Checkout Are Split Across Competing Modules

Files:

- `assets/js/cart.js`
- `assets/js/shopify-buy-button.js`
- `shop.html`
- `products/*.html`
- `README.md`

Problem:

`assets/js/cart.js` stores local cart lines under `bassbinge-cart` with fields like `id`, `name`, `color`, `weight`, `rattle`, `price`, `qty`, and `image`. `assets/js/shopify-buy-button.js` stores Shopify variant lines under `bass-binge-cart-v1` with fields like `productKey`, `variantId`, and `quantity`.

The README says the shop page keeps selection on the Bass Binge site and sends shoppers to Shopify for checkout, but `shop.html` currently loads `assets/js/product-page.js`, `assets/js/cart.js`, and `assets/js/main.js` twice. It does not load `assets/js/shopify-buy-button.js`, and the visible `Secure Checkout` link starts as `href="#"`.

Why this hurts:

The cart Interface is shallow because callers need to know which cart Implementation they are dealing with, which storage key is active, and whether the line can become a checkout line. The deletion test says both cart Implementations are weak: deleting either one would force cart and checkout logic to reappear across pages.

Deepening opportunity:

Create one cart and checkout Module that owns cart persistence, cart drawer rendering, quantity changes, checkout URL generation, and legacy cart migration. Product pages and shop cards should add the same Jig Build shape to the same cart Module.

### 2. Product Catalog Facts Are Duplicated Across HTML, JavaScript, and Scripts

Files:

- `products/*.html`
- `assets/js/shopify-buy-button.js`
- `fix_color_images.py`
- `fix_color_images_v2.py`
- `update_color_images.py`
- `apply_color_images.py`
- `assets/img/products/*`

Problem:

Jig names, colors, image paths, weights, prices, swatch colors, search terms, and Shopify variant IDs live in different places. Product pages use `data-colors`, `data-color-images`, `data-weights`, and `data-rattle`. `assets/js/shopify-buy-button.js` embeds a separate product list with Shopify image URLs and variant IDs. The Python scripts contain old color names and absolute paths, and several are one-off rewrites of the same HTML attributes.

Why this hurts:

The current Interface relies on ordering invariants such as `colors[i]` matching `colorImages[i]`. A color rename or image change has no single place to update, so bugs spread across product pages, shop cards, cart display, search, and checkout.

Deepening opportunity:

Create a Bass Binge Product Catalog Module that owns product facts and exposes a small read Interface. HTML should identify a jig by stable key; JavaScript should derive colors, images, price, swatches, search text, and checkout mapping from the catalog.

### 3. Product Page Behavior Is One Large Mixed Module

Files:

- `assets/js/product-page.js`
- `products/*.html`
- `assets/css/product.css`

Problem:

`assets/js/product-page.js` parses catalog-like facts, renders swatches, renders weights, calculates price, builds cart lines, shows toast messages, opens the cart drawer, builds the gallery, handles touch/mouse drag, and updates fallback hero images. Rattle selection is present in HTML for some products where `data-rattle="false"`, and price updates are tied to unrelated UI changes rather than a clear selected Jig Build state.

Why this hurts:

The Module is large but not deep. Its Interface includes many hidden DOM requirements and ordering rules, and tests would have to drive a lot of unrelated behavior to verify one selected Jig Build.

Deepening opportunity:

Refactor the product page around a selected Jig Build state. Gallery behavior can remain an internal Module. Cart insertion should call the unified cart Module rather than constructing a separate local line shape.

### 4. Page Shell Markup Is Repeated and Drifting

Files:

- `index.html`
- `shop.html`
- `about.html`
- `contact.html`
- `products/*.html`

Problem:

Header, navigation, footer, cart drawer, and common scripts are repeated across pages. Drift already exists: `shop.html` includes `assets/js/main.js` twice and loads product/cart scripts that do not match the README checkout plan.

Why this hurts:

Page chrome changes require broad manual edits, which weakens Locality. It also makes script loading fragile because each page owns a copy of the script list.

Deepening opportunity:

Create a Page Shell Module at build time or through a small static include process. The generated pages should remain static and crawlable, but shared shell markup and script includes should have one source.

## Target Architecture Spec

### Constraints

- Preserve static hosting. The site should still deploy as static files to Vercel.
- Keep product copy and product details crawlable in HTML.
- Avoid adding a large framework unless the user explicitly asks for it.
- Prefer plain JavaScript Modules/globals or a small standard-library build script.
- Do not silently send a cart line to checkout unless it has a verified Shopify mapping.
- Keep the existing local user edit in `assets/js/product-page.js` unless the implementation intentionally replaces that section.

### Bass Binge Product Catalog Module

Suggested path:

- `assets/js/catalog.js` for browser runtime data, or
- `data/catalog.json` plus a small generation script if moving to build-time HTML generation.

Interface responsibilities:

- Return a jig by stable key.
- List published jigs for shop rendering.
- Return selectable colors, weights, rattle options, product images, and swatches for a jig.
- Return a selected Jig Build from `productKey`, `colorKey`, `weightKey`, and `rattle`.
- Return the Shopify checkout mapping for a selected Jig Build when one exists.
- Provide search/filter text for shop controls.

Required invariants:

- Every jig has a unique stable key and product page slug.
- Every color has a unique stable key within its jig.
- Every color references an existing image file or a deliberate remote image URL.
- Every swatch is explicit; do not generate swatches from array index.
- Every checkoutable Jig Build maps to a Shopify variant ID or documented Shopify checkout strategy.
- A rattle option that changes price cannot rely only on local price math.

### Cart and Checkout Module

Suggested path:

- `assets/js/cart-checkout.js`

Interface responsibilities:

- Load, save, and migrate cart state.
- Add a selected Jig Build and quantity.
- Set quantity or remove a cart line.
- Return cart lines with catalog-enriched display data.
- Return subtotal based on catalog-backed pricing.
- Render the cart drawer.
- Open and close the cart drawer.
- Build a Shopify checkout URL from checkoutable lines.

Required invariants:

- Use one storage key going forward, for example `bass-binge-cart-v2`.
- Legacy keys `bassbinge-cart` and `bass-binge-cart-v1` should be migrated or explicitly cleared with a user-visible note.
- Cart line IDs should be stable for the selected Jig Build, not based on array indexes.
- Checkout must be blocked or clearly redirected if any cart line lacks Shopify mapping.
- Cart rendering should avoid injecting unchecked strings through `innerHTML`.

Open Shopify mapping decision:

The current Shopify embedded catalog appears color-based, while product pages also expose weight and rattle selections. If weight or rattle changes price or inventory, Shopify must represent those choices as variants or as another deliberate checkout mapping. The next agent should verify Shopify data before implementing final checkout behavior.

### Product Page Module

Suggested path:

- Keep `assets/js/product-page.js`, but shrink its external Interface.

Interface responsibilities:

- Initialize from a product page root and a `data-product-key`.
- Read all product facts from the Bass Binge Product Catalog Module.
- Maintain one selected Jig Build state.
- Render color, weight, and rattle controls from catalog facts.
- Synchronize selected color with the Product Gallery.
- Update price and selected labels from the selected Jig Build.
- Add the selected Jig Build to the unified cart Module.

Internal Modules:

- Product Gallery: track slides, thumbnails, arrows, keyboard, touch, and mouse drag.
- Product Options: color/weight/rattle control rendering and state changes.

Required invariants:

- A page should not embed `data-colors` or `data-color-images` arrays once catalog extraction is complete.
- Rattle controls should only render for jigs where rattle is available.
- Price should update immediately when any price-affecting option changes.
- Gallery image count should be derived from available product images, not hard-coded counter text.

### Shop Page Module

Suggested path:

- `assets/js/shop.js`, or folded into `assets/js/cart-checkout.js` only if it stays small.

Interface responsibilities:

- Render or enhance shop product cards from the catalog.
- Provide color selection, quantity selection, search, and filters.
- Add selected Jig Builds to the unified cart Module.
- Open checkout through the unified cart and checkout Module.

Required invariants:

- Shop and product pages add the same cart line shape.
- Search/filter data comes from catalog facts, not repeated hidden text.
- The shop page should load `main.js` exactly once.

### Page Shell Module

Recommended approach:

Add a small build-time generation step rather than rendering the main navigation/footer only after JavaScript loads. This keeps the deployed files static and crawlable while making shared markup local to one place.

Suggested paths:

- `templates/header.html`
- `templates/footer.html`
- `templates/cart-drawer.html`
- `templates/page.html`
- `scripts/build-site.py` or `scripts/build-site.mjs`

Interface responsibilities:

- Compose static pages from shared shell partials and page body content.
- Emit final HTML files for Vercel/static hosting.
- Ensure each page has the correct relative asset paths.
- Ensure each page has the right script list exactly once.

Lower-tooling alternative:

If the user does not want a build step, use a browser Page Shell Module to inject repeated cart drawer markup and keep header/footer duplicated for now. This gives less Locality than build-time shell generation but avoids changing the deployment workflow.

## Implementation Plan

### Phase 0: Baseline and Safety

1. Confirm `git status --short --branch`.
2. Preserve the pre-existing local edit in `assets/js/product-page.js`.
3. Start a local server with `python3 -m http.server 8080`.
4. Manually record baseline behavior for home, shop, and all product pages.
5. Note current checkout behavior before replacing it.

Deliverable:

- Baseline notes in the implementation summary.

### Phase 1: Catalog Extraction

1. Create the Bass Binge Product Catalog Module.
2. Move current product facts into the catalog.
3. Add stable product keys and color keys.
4. Add explicit swatches for product-page colors.
5. Preserve current image paths and public product copy.
6. Add a validator script that checks product keys, color keys, image paths, default selections, and checkout mappings.
7. Update product pages to reference `data-product-key` while keeping behavior equivalent.

Deliverable:

- Catalog Module.
- Validation script.
- Product pages no longer carry catalog arrays.

### Phase 2: Unified Cart and Checkout

1. Create `assets/js/cart-checkout.js`.
2. Define one cart line shape around Jig Build selection.
3. Migrate or handle both legacy storage keys.
4. Move cart drawer rendering and open/close behavior into the new Module.
5. Build Shopify checkout URLs from catalog checkout mappings.
6. Replace `assets/js/cart.js` and `assets/js/shopify-buy-button.js` usage with the unified Module.
7. Update README checkout notes to match runtime behavior.

Deliverable:

- One cart storage key and one checkout path.
- Product pages and shop page share the same cart.

### Phase 3: Product Page Refactor

1. Refactor `assets/js/product-page.js` around selected Jig Build state.
2. Render swatches, weight controls, and rattle controls from the catalog.
3. Move gallery behavior behind an internal Product Gallery Module.
4. Ensure color selection updates gallery, hero image, selected label, and cart line data.
5. Ensure weight and rattle changes update price immediately.
6. Remove dead DOM assumptions such as unused `rattleGroup` if no longer needed.

Deliverable:

- Product-page behavior is driven by the catalog and unified cart Module.

### Phase 4: Shop Page Alignment

1. Make `shop.html` load the correct scripts once.
2. Render or enhance product cards from catalog facts.
3. Make shop color selection use the same selected Jig Build logic as product pages.
4. Make `Secure Checkout` point to a real checkout URL only when cart lines are checkoutable.
5. Remove or retire dead Shopify buy-button code after replacement.

Deliverable:

- Shop page behavior matches README and product-page cart behavior.

### Phase 5: Page Shell Consolidation

1. Choose build-time page shell generation unless the user rejects a build step.
2. Extract header, footer, cart drawer, and script lists into shared templates.
3. Generate pages from templates.
4. Check relative links for root pages and product pages.
5. Remove duplicated shell markup from source templates or clearly separate source files from generated output.

Deliverable:

- One Page Shell source for repeated markup.
- Generated static HTML remains deployable.

### Phase 6: Verification

Minimum verification:

- Run catalog validator.
- Run JavaScript syntax checks on changed JS files.
- Run the local static server.
- Browser-test desktop and mobile widths for:
  - `index.html`
  - `shop.html`
  - each product page
  - cart drawer open/close
  - add-to-cart from product pages
  - add-to-cart from shop
  - quantity changes
  - checkout URL generation
  - color gallery sync
  - rattle price behavior

Recommended automated smoke tests:

- Add a small Playwright smoke suite if the repo accepts a dev dependency.
- If avoiding dependencies, add a Node or Python validator for catalog and generated HTML.

## Acceptance Criteria

- There is one Bass Binge Product Catalog Module for product facts.
- Product pages no longer duplicate color/image/weight arrays.
- There is one cart Module and one cart storage key going forward.
- Product pages and shop page add the same cart line shape.
- Checkout either produces a Shopify URL from valid checkout mappings or blocks with a clear message.
- Rattle options render only when available and update price immediately when selected.
- Product gallery count, thumbnails, hero image, and selected color stay synchronized.
- `shop.html` no longer loads `main.js` twice.
- Shared page chrome has one source or a documented lower-tooling compromise.
- One-off color image rewrite scripts are removed, archived, or replaced by catalog validation/generation.
- Verification steps are run and summarized.

## Suggested Next-Agent Skills

- `improve-codebase-architecture` for preserving the intended Module depth.
- `verification-before-completion` for enforcing the validation and browser checks.
- `build-web-apps:frontend-testing-debugging` if adding browser smoke tests or using the in-app browser.

## Suggested First Task for the Next Agent

Start with Phase 1 and Phase 2 together only after checking Shopify variant coverage. If Shopify cannot represent all currently selectable Jig Builds, implement the catalog and cart unification first, but keep final checkout blocked for unmapped lines instead of pretending local prices are checkout prices.
