# Shopify Storefront Implementation Runbook

Status: implementation and Shopify configuration complete; inventory handoff pending
Last verified: 2026-07-19

The developer should use Shopify Collaborator access for the one-time setup.
The merchant must not share their Shopify password. A ready-to-send access
request is available in `docs/shopify-client-access-request.md`.

## What Is Already Implemented

- `/api/catalog` reads published Shopify products through Storefront API
  `2026-01`, normalizes the response, and caches it for 45 seconds with a
  five-minute stale window.
- The existing shop and product-page controls wait for the live catalog and use
  Shopify variant prices, availability, IDs, and assigned images.
- Missing color/weight combinations remain visible but disabled.
- The two existing Fruit Fly variants are discovered automatically; they no
  longer require hand-entered IDs in the browser catalog.
- `/api/shopify-cart` creates a Shopify Storefront Cart and returns its
  `checkoutUrl`; checkout no longer uses a `/cart/variant:quantity` permalink.
- The cart endpoint supports one shared Rattle Add-on variant as a nested child
  line using `parent.lineId`.
- The homepage has a live limited-drop rendering seam. It keeps the approved
  Heartlander presentation and reads its current `$5.99` price, availability,
  image, and variant ID from Shopify even before the reusable drop template is
  configured.

## Required Shopify Admin Work

Complete these items in order. The storefront intentionally reports or disables
incomplete commerce data rather than inventing it.

### 1. Verify Heartlander

Open **Products > Limited Drop** and verify the only variant remains `$5.99`.
The live Shopify value and local fallback now agree.

Completed 2026-07-19: the live variant is `$5.99`. The product now has product
type `Limited Drop` and tag `limited-drop`.

### 2. Create the PeeWee Football Weight Matrix

Open **7/16 oz. PeeWee Football Jig** and make the options exactly:

- `Color`: Blackberry Smoothie, Magic Brownie, RyRy Special, Biggie Smalls,
  A Little Lit, Ogre
- `Weight`: 7/16 oz, 5/16 oz, 3/16 oz

There must be 18 real variants, one for every color/weight combination. Preserve
the existing page choices and use Shopify prices and inventory on each variant.
Assign the correct color photograph to every variant at that color.

Completed 2026-07-19: the product now has exactly 18 variants. The original six
7/16 oz variants retained their inventory. All twelve new 5/16 oz and 3/16 oz
variants are tracked, priced at `$5.00`, have their color images assigned, and
start at zero inventory until the merchant supplies real counts.

### 3. Verify the Single-Weight Products

The other established products currently resolve correctly at their one approved
weight. Keep each as its own product. If a `Weight` option is added for
consistency, use the exact weight already displayed by its existing product page.

### 4. Create the Shared Rattle Add-on

Create a product with:

- Title and handle: `Rattle Add-on` / `rattle-add-on`
- One variant priced at `$0.50`
- Inventory tracking enabled with the complete shared rattle quantity
- Product status Active
- Published to the Headless storefront used by this site
- Hidden from navigation, search engines, and normal collection browsing

Do not add `Rattle` as a duplicate Shopify option on every jig variant. The site
adds this one shared variant beneath a rattle-enabled jig and synchronizes its
quantity when creating checkout.

Completed 2026-07-19: a tracked, zero-inventory product named `Rattle Add-on`
was created at `$0.50`, with vendor `Bass Binge Baits`, product type
`Rattle Add-on`, and tag `rattle-add-on`. It is Active and published only to the
Headless storefront, so it remains unavailable until the merchant supplies the
real shared inventory count. The two eligible jig products have the
`rattle-enabled` tag.

### 5. Configure Headless Storefront Access

In Shopify admin, install or open the **Headless** sales channel and create a
storefront for Bass Binge. Enable Storefront API access for products, inventory,
tags, metafields, and carts. Add its private token to Vercel Production and
Preview as:

```text
SHOPIFY_STOREFRONT_PRIVATE_TOKEN=shpss_...
```

Also add these explicit values, or rely on the code defaults:

```text
SHOPIFY_STORE_DOMAIN=bassbingebaits.myshopify.com
SHOPIFY_STOREFRONT_API_VERSION=2026-01
```

Never place the private token in HTML or `assets/js/catalog.js`.

Completed 2026-07-19: Shopify's official **Headless** sales channel is installed
and the `Bass Binge Baits Headless` storefront was created. Its Storefront API
permissions include inventory access. The private token is stored as an
encrypted Vercel environment variable in both Production and Preview; it was
not written to the repository or browser code.

### 6. Prepare the Limited Drop Product

Create metafield definitions on Products:

| Name | Namespace and key | Type |
| --- | --- | --- |
| Drop starts at | `bass_binge.drop_starts_at` | Date and time |
| Drop ends at | `bass_binge.drop_ends_at` | Date and time |
| Short description | `bass_binge.short_description` | Single-line text |
| Badge text | `bass_binge.badge_text` | Single-line text |

Update Heartlander or a duplicate template so that it has:

- Product type `Limited Drop`
- Tag `limited-drop`
- A specific product title, not `Limited Drop`
- Real Color and Weight option values rather than `Default Title`
- A square assigned variant image
- The four metafields above as applicable
- Publication to the Headless storefront

The adapter hides scheduled drops, disables sold-out or expired drops, keeps an
expired drop visible for 30 days, and then removes it from the customer-facing
homepage response.

Completed 2026-07-19: all four definitions above were created with Storefront
API access enabled. Heartlander's single variant now uses Color `Heartlander`
and Weight `5/8 oz`, remains `$5.99`, and is available through the Headless
storefront. The merchant can optionally enter scheduled drop dates, badge text,
and short description later; the storefront already has safe fallback content.

## Verification

Run:

```bash
node scripts/validate-catalog.js
node scripts/audit-release.js
node scripts/validate-shopify-integration.js --strict
```

The strict Shopify check is the Phase 0 completion gate. It passed against the
private Storefront token on 2026-07-19.

## Merchant Inventory Handoff

The only required commerce-data handoff is for the merchant to provide actual
counts for:

- the twelve new PeeWee Football 5/16 oz and 3/16 oz variants
- the one shared Rattle Add-on variant

Leave those quantities at zero until the merchant confirms stock. Shopify and
the storefront will keep them unavailable, preventing overselling.

Then verify on a Vercel Preview deployment:

1. Change one Shopify variant image and confirm the site changes within 60
   seconds.
2. Change one variant price and confirm the shop card, product page, cart, and
   checkout agree.
3. Mark one variant sold out and confirm its option remains visible but disabled.
4. Add a normal jig and complete a test checkout.
5. Add a rattle-enabled jig with Rattle Yes; confirm the Rattle Add-on appears
   nested beneath it at checkout and quantity matches the jig.
6. Remove the parent and confirm Shopify removes its nested child.
