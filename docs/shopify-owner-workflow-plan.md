# Shopify Owner Workflow Plan

Status: proposed
Date: 2026-07-19
Repository: `/Users/josh/Desktop/Bass Binge Baits`

## Decision

Use Shopify as the single source of truth for products, variants, prices,
inventory, product images, publishing state, and limited drops.

Do not build a separate content management system for the first release. The
owner already uses Shopify, and Shopify already provides mobile and desktop
image upload, drag-and-drop media ordering, cropping, rotation, background
editing, alt text, product status, inventory, and scheduled publishing.

Build the custom storefront so Shopify changes appear automatically. First
prove the owner workflow using Shopify's native admin. Only then build a small
branded owner console if the native workflow still creates meaningful friction.
Design the storefront's catalog seam so that a reusable console can be added
later without changing the storefront again.

## Why This Is the Lowest-Maintenance Route

- The owner already logs into Shopify to manage orders and inventory.
- Product media belongs beside the exact sellable variant it represents.
- Shopify can store one assigned image per variant, which matches the current
  one-photo-per-color requirement.
- Shopify's media editor works on mobile and desktop and supports crop, rotate,
  resize, background editing, and reverting to the original.
- Shopify already hosts and optimizes product images.
- A second product database would create synchronization and support work.
- The owner should never edit JavaScript, Git files, variant IDs, or deployment
  settings.

## Verified Current-State Findings

The live Shopify public catalog and the local catalog were inspected on
2026-07-19.

### Critical Catalog Mismatches

1. The Heartlander limited drop is `$5.99` in Shopify and must remain `$5.99`
   throughout the storefront and checkout.
2. The Heartlander title, image, price, and checkout variant are hard-coded in
   `assets/js/catalog.js` and its homepage presentation is hard-coded in
   `index.html`.
3. The live Shopify limited-drop product has one `Default Title` variant and no
   identifying `limited-drop` tag.
4. Every normal Shopify product currently has only one effective option: color.
   Shopify does not currently contain the weight and rattle combinations that
   the custom website offers.
5. The local catalog maps one Shopify variant ID per color. Its checkout logic
   intentionally returns no mapping for a non-default weight or `rattle: yes`.
   Those builds can be selected locally but cannot be checked out.
6. Shopify contains Fruit Fly variants for the Heavy Cover Football and PeeWee
   Football HD products, but the local catalog does not map them for checkout.

This means image automation cannot safely be treated as an isolated upload
feature. Shopify's sellable product model must be made authoritative first.

## Confirmed Business Decisions

- Regular PeeWee, PeeWee HD, PeeWee Football, and the other established jig
  families remain distinct products with their own product pages.
- The existing website layout and product-page behavior are already approved.
  Product pages, weight choices, rattle availability, control placement, card
  layout, gallery layout, copy, and overall visual presentation must not be
  redesigned or reinterpreted as part of this work.
- The weight choices already shown on each existing product page are final and
  authoritative. Shopify must be configured to support those choices exactly.
- Only products that currently offer a rattle on the website should expose the
  rattle choice. The current catalog marks PeeWee Football and Heavy Cover
  Football as rattle-capable.
- Rattles come from one shared inventory pool. Inventory is not divided by jig
  family, color, or weight.
- A selected rattle appears as a nested child directly beneath its jig in the
  storefront cart, Shopify checkout, and order records.
- Product photo uploads will use one consistent `1:1` square source crop while
  preserving the website's existing display frames.
- Expired limited drops remain visible for 30 days before leaving the primary
  homepage presentation. After 30 days, they disappear from the customer-facing
  site entirely; there is no recent-drops or historical-drops section.
- The Heartlander limited drop price is `$5.99`; Shopify is already correct.

## Target Owner Experience

### Update a Normal Product Photo

1. Open the Shopify mobile app or Shopify admin.
2. Open **Products** and select the product.
3. Select the relevant color variant.
4. Take a photo or choose one from the phone/computer.
5. Crop, straighten, rotate, and center it in Shopify's media editor.
6. Assign it to the variant and save.
7. The Bass Binge website reflects the new image within 60 seconds without a
   code change or deployment.

One photograph remains assigned to one color variant. The original upload is
preserved so an edit can be reverted.

### Create a Limited Drop

1. Duplicate a hidden **Limited Drop Template** product in Shopify.
2. Enter the drop name, price, inventory, weight, rattle choices if applicable,
   and color.
3. Upload one image, crop/straighten it, and assign it to the variant.
4. Add the `limited-drop` tag.
5. Set the launch time and optional expiration time.
6. Preview the product.
7. Publish now or schedule publication.

The storefront automatically finds the newest eligible limited drop. A sold-out
or expired drop remains visible with a clear state and a disabled purchase
button. Each drop stays a separate Shopify product so orders, inventory,
analytics, and historical photography remain accurate.

## Shopify Product Model

### Normal Products

Every shopper choice that affects price or inventory must resolve to one real
Shopify sellable item or tracked add-on.

- Keep each established jig family as its own Shopify product and product page.
- Use `Color` as a Shopify option.
- Use `Weight` as an additional Shopify option wherever the existing product
  page already offers multiple weights, preserving those exact choices.
- Do not model `Rattle` as duplicate inventory on every product variant. Model
  the jig itself and the shared rattle supply separately.

The existing website is the approved shopper-facing Interface. Shopify's
product data must be brought into alignment behind that Interface. This plan
does not authorize adding, removing, renaming, regrouping, or reordering any
existing product, weight, or rattle choice.

The storefront must not offer a color/weight choice without a real jig variant,
or a rattle choice when the shared Rattle Add-on is unavailable.

Recommended variant invariants:

- Every available color/weight combination has one Shopify jig variant ID.
- Variant price comes from Shopify, never local price arithmetic.
- Inventory comes from Shopify for the exact variant.
- Every color variant has exactly one assigned image.
- Invalid combinations do not render as selectable.
- Sold-out combinations remain visible but disabled.

### Shared Rattle Add-on

Create one hidden Shopify product with one tracked variant representing the
shared rattle supply. Recommended working title: `Rattle Add-on`.

When a shopper chooses **Rattle: Yes**:

1. Add the selected jig variant to the cart.
2. Add one Rattle Add-on unit for each jig quantity.
3. Add the Rattle Add-on as a nested child cart line whose parent is the selected
   jig line.
4. Preserve the parent-child relationship through Shopify checkout, order
   confirmation, customer emails, order status, and merchant order handling.
5. Prevent selection when the global Rattle Add-on inventory is sold out.

The rattle's `$0.50` price comes from the Shopify add-on variant. The storefront
must not calculate or invent the add-on price locally. This keeps one global
inventory count accurate without multiplying rattle inventory across every
color and weight.

Use Shopify Storefront Cart nested-line relationships rather than a fixed bundle
or two unrelated checkout lines. The parent jig line needs a stable
configuration attribute so Shopify does not merge an otherwise identical
rattle-selected jig with a no-rattle jig. Removing the parent removes its child;
changing parent quantity must keep child quantity synchronized.

This requires replacing the current Shopify cart-permalink checkout with a
Storefront Cart checkout URL. The cart Module should persist the Shopify cart ID,
add parent and child merchandise lines, and redirect to the returned checkout
URL. A separate bundle app is not required.

### Limited Drops

Create one Shopify product definition for the owner to duplicate. It should
include:

- Vendor: `Bass Binge Baits`
- Product type: `Limited Drop`
- Tag: `limited-drop`
- A standard description outline
- Shipping and tax settings
- Default sales-channel settings
- Metafields:
  - `bass_binge.drop_starts_at`
  - `bass_binge.drop_ends_at`
  - `bass_binge.short_description`
  - `bass_binge.badge_text`

Do not reuse or overwrite the same limited-drop product for successive drops.

## Target Storefront Architecture

### Shopify Catalog Adapter

Add one server-side Vercel function that reads Shopify and returns the normalized
Bass Binge Product Catalog shape already expected by the storefront.

Responsibilities:

- Read published products and limited drops.
- Return product handle, title, description, options, variants, exact prices,
  availability, inventory-derived status, assigned variant images, tags, and
  approved metafields.
- Normalize Shopify data once rather than across every page.
- Cache responses for approximately 30-60 seconds and allow stale data briefly
  during an upstream failure.
- Keep privileged Shopify credentials on the server.
- Return explicit validation errors for incomplete products instead of silently
  inventing data.

The existing `assets/js/catalog.js` should stop being an independent source of
commerce facts. It can become the browser-side reader for the normalized
catalog, with a small temporary fallback during migration.

### Storefront Consumers

- **Homepage:** Render the current limited drop from Shopify.
- **Shop page:** Render current price, image, availability, and variant choices.
- **Product pages:** Build the gallery and option selectors from Shopify
  variants and assigned images.
- **Cart:** Store and submit the exact Shopify variant ID selected by the user.
- **Checkout:** Never derive price or inventory locally.

### Limited-Drop State Rules

Use a deterministic state model:

1. **Scheduled:** Start time is in the future; not visible publicly.
2. **Live:** Published, inside the time window, and at least one variant is
   available.
3. **Sold out:** Inside or after the launch window with no available inventory;
   visible but not purchasable.
4. **Expired:** End time has passed; visible as ended but not purchasable.
5. **Recent expired:** Ended within the last 30 days; remains visible as ended.
6. **Removed from site:** More than 30 days past its end time; absent from all
   customer-facing drop presentation. The Shopify product remains retained or
   archived only as required for orders, reporting, and administration.

Shopify can schedule publication. Automatic expiration should initially be
enforced by the catalog adapter and storefront. Before launch, verify whether a
direct Shopify checkout link could bypass that display rule. If it can, add a
small scheduled server-side job that unpublishes or archives expired drops so
expiration is enforced at Shopify as well.

## Image Presentation Rules

Use the original Shopify-hosted image and request display-sized derivatives.

- Prepare uploaded product and limited-drop source photos on a consistent `1:1`
  square canvas.
- Let the owner crop and straighten in Shopify before saving.
- Use `object-fit: contain` for product-detail imagery so no jig is cut off.
- Preserve every existing gallery, shop-card, homepage-card, and limited-drop
  frame dimension. Fit the square source image into those existing frames with
  the current contain/padding behavior, preferably respecting a focal point when
  available.
- Keep the background treatment consistent across cards.
- Display a useful error if an image is missing rather than a broken image icon.
- Add concise alt text using product, color, and weight.

Do not add a separate image host or paid image-editing product in the first
release.

## Phased Implementation

### Phase 0: Correct the Commerce Model

1. Verify Heartlander remains `$5.99` in Shopify and the storefront.
2. Keep each established jig family on its own product page.
3. Create Shopify variants that match every color/weight combination already
   offered by each existing product page.
4. Create the hidden, inventory-tracked Rattle Add-on product at `$0.50`.
5. Preserve the current rattle selectors exactly where the website already
   exposes them.
6. Add Shopify support behind every existing selection; do not remove or change
   existing product-page choices.
7. Map the existing Fruit Fly variants.
8. Verify every selectable build and add-on against Shopify price and
   availability.

Completion gate: every selection the website offers has exactly one verified
Shopify jig variant, any selected rattle has one shared tracked add-on, and all
displayed prices match checkout.

### Phase 1: Make Shopify the Live Catalog

1. Add the Shopify Catalog Adapter Vercel function.
2. Add catalog response validation and caching.
3. Convert shop, product pages, cart, and checkout to exact Shopify variants.
4. Replace local product images and prices with Shopify values.
5. Replace cart-permalink checkout with the Shopify Storefront Cart flow.
6. Add the rattle as a nested child line beneath its parent jig and synchronize
   quantity/removal behavior.
7. Preserve static descriptive copy temporarily where SEO or migration safety
   requires it.
8. Keep a temporary fallback until live catalog loading is proven.

Completion gate: changing a price, inventory count, or assigned variant image in
Shopify updates the site without editing the repository or deploying it.

### Phase 2: Limited-Drop Automation

1. Create the Limited Drop Template, tag, and metafield definitions.
2. Render limited drops from Shopify rather than hard-coded homepage markup.
3. Implement scheduled, live, sold-out, expired, and archived states.
4. Keep sold-out and expired cards visible with purchase disabled.
5. Add enforced automatic expiration if a storefront-only rule can be bypassed.

Completion gate: the owner can create and schedule a new drop entirely inside
Shopify, and the homepage updates automatically.

### Phase 3: Owner Usability Test and Guide

1. Create a one-page mobile-first guide with screenshots.
2. Have the owner replace one normal color image.
3. Have the owner create a draft limited drop from the template.
4. Observe without coaching and record every point of confusion.
5. Simplify Shopify fields, saved views, and instructions based on evidence.

Completion gate: the owner can update a color image in under two minutes and
create a complete scheduled drop in under five minutes without developer help.

### Phase 4: Reusable Branded Owner Console, Only If Earned

Build this after the Shopify-native workflow has been used and its real friction
is known. The initial console should remain deliberately narrow:

- **Update Product Photo**
  - Product selector
  - Color selector
  - Camera/file picker
  - Crop, straighten, rotate, and preview
  - Publish
- **Create Limited Drop**
  - Duplicate-from-template behavior
  - Minimal product fields
  - Variant and inventory fields
  - Image editor
  - Preview
  - Publish now or schedule

Reusable console Modules:

- Owner Authentication Module
- Client Branding and Rules Module
- Commerce Adapter Module, with Shopify as the first adapter
- Product Photo Workflow Module
- Limited Drop Workflow Module
- Image Crop and Preview Module
- Publish Validation Module

Do not make the first version a universal CMS. Extract multi-client behavior
after a second real client proves what actually varies. Keep client branding,
allowed product fields, crop ratio, and drop rules configurable; keep commerce
semantics inside the Shopify adapter.

## Acceptance Criteria

- The owner never edits code, filenames, variant IDs, Git, or Vercel.
- Phone and desktop uploads are both supported.
- An owner can crop, center, rotate, and preview an image.
- A color has one authoritative Shopify image.
- Product and limited-drop source photos use a consistent square crop inside
  the existing display frames.
- Existing page layouts, controls, option choices, copy, and visual hierarchy
  remain unchanged.
- Site changes appear within 60 seconds of saving in Shopify.
- Every color/weight selection maps to one Shopify jig variant.
- Rattle selections decrement one shared Shopify inventory pool.
- A selected rattle renders beneath its jig throughout cart, checkout, and order
  surfaces.
- Displayed price equals checkout price.
- Sold-out combinations cannot be added but remain visible.
- A limited drop is a separate Shopify product.
- Drops can be scheduled and automatically expire.
- Sold-out drops remain visible, and expired drops remain visible with an
  accurate status during their 30-day homepage window.
- Expired drops remain directly on the homepage for 30 days and then disappear
  from the customer-facing site.
- An upstream Shopify failure does not replace the catalog with broken markup.
- No privileged Shopify credential is delivered to the browser.
- The existing site remains statically hosted on Vercel.

## Deliberate Non-Goals for the First Release

- A separate headless CMS
- A new image-storage subscription
- Automatic AI background replacement
- Multiple images per color
- A universal multi-commerce dashboard
- Custom approval roles or editorial workflows
- Rebuilding the storefront in a large framework solely for this feature
- Any redesign or restructuring of the approved storefront
