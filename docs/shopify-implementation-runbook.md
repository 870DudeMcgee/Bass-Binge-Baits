# Shopify Storefront Implementation Runbook

Status: universal ingestion implemented; live owner-workflow proof pending
Last verified: 2026-07-26

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

## Catalog Configuration Invariants

- Shopify's configured Headless publication is the only product-inclusion and
  public commerce authority. Browser catalog state begins empty and accepts
  only a validated admitted `CatalogEnvelope`; there is no local product
  fallback.
- Configure exactly one supported Redis-compatible backend through either the
  `KV_REST_API_*` pair or the `UPSTASH_REDIS_REST_*` pair. Missing or partial
  durable-store credentials are a configuration failure, not permission to use
  process memory.
- Leave `CATALOG_CACHE_NAMESPACE` unset. The runtime derives a namespace from
  CatalogEnvelope schema version, normalized `*.myshopify.com` shop identity,
  and the Vercel trust identity. Production requires
  `VERCEL_PROJECT_PRODUCTION_URL`; Preview requires a unique
  `VERCEL_DEPLOYMENT_ID` or `VERCEL_URL`. A mismatched manual namespace fails
  closed with `catalog_namespace_invalid`.
- Keep `SHOPIFY_STOREFRONT_PRIVATE_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`,
  `CATALOG_HEALTH_TOKEN`, `CRON_SECRET`, and durable-store credentials
  server-only. The webhook, health, and reconciliation secrets are separate
  values with separate purposes.
- `/products/:handle` must remain rewritten to
  `/api/product?handle=:handle`. Do not add public `products/*.html` shells;
  every established or novel handle must pass the same current admission
  result.
- A generation is fresh for 45 seconds and may be served as last-known-good for
  at most the bounded five-minute stale window. After that window, catalog and
  product requests return an explicit unavailable response rather than local
  commerce data.

## Required Shopify Admin Work

Complete these items in order. The storefront intentionally reports or disables
incomplete commerce data rather than inventing it.

### 1. Verify Heartlander

Open **Products > Limited Drop** and verify the only variant remains `$5.99`.
The customer surface must use the admitted Shopify value; there is no local
commerce fallback to reconcile.

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

Generate a separate high-entropy server-only token for the protected catalog
health endpoint and store it in Vercel Production and Preview as:

```text
CATALOG_HEALTH_TOKEN=<random server-only value>
```

Request `/api/catalog-health` with
`Authorization: Bearer <CATALOG_HEALTH_TOKEN>`. The endpoint returns safe
generation, freshness, admission-count, and grouped issue metadata. It never
returns this token or Shopify credentials. Do not put the token in browser
JavaScript, query parameters, or repository files.

Configure one shared Redis-compatible catalog store for Production and Preview.
Use either Vercel KV-compatible names:

```text
KV_REST_API_URL=<https endpoint>
KV_REST_API_TOKEN=<server-only token>
```

or the equivalent Upstash names:

```text
UPSTASH_REDIS_REST_URL=<https endpoint>
UPSTASH_REDIS_REST_TOKEN=<server-only token>
```

Also configure separate high-entropy server-only secrets:

```text
SHOPIFY_WEBHOOK_SECRET=<Shopify webhook signing secret>
CRON_SECRET=<Vercel cron and protected reconciliation token>
```

The current Vercel account uses the Hobby plan. Hobby permits only one scheduled
invocation per day, so `vercel.json` runs `/api/catalog-reconcile` at
`0 0 * * *` as a missed-event backstop. Near-real-time updates still come from
signed Shopify webhooks, and customer catalog reads retain the 45-second
read-driven reconciliation path. Vercel Cron runs only on Production
deployments; Preview proof must use a signed webhook or an authorized request to
the protected reconciliation endpoint.

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
storefront. `drop_starts_at` and `drop_ends_at` are required admission facts for
a limited drop. Badge text and short description remain optional presentation
metadata and do not replace Shopify commerce facts.

## Universal Ordinary-Product Proof

Perform this only after the universal-ingestion commit is deployed and the
shared store, protected health endpoint, and refresh path are configured.

1. Create a completely new ordinary Shopify product whose handle has never
   appeared in repository catalog data. Give it a title, square product image,
   valid price, tracked inventory, and at least one sellable variant.
2. Publish it to **Bass Binge Baits Headless**. Record the save time and the
   first validated catalog generation containing it.
3. Confirm it appears exactly once on `/shop` and that
   `/products/<exact-shopify-handle>` resolves through the generic route.
4. Confirm the admitted gallery, option groups, selected variant, price,
   availability, merchandise GID, cart line, and checkout handoff match
   Shopify.
5. Change its price, media, and inventory in Shopify. After each save, record
   the next validated generation and verify the customer surfaces again.
6. Remove it from the Headless publication. Confirm the next validated
   generation omits it, the collection card disappears, and its former route
   returns not found without local fallback data.
7. For quarantine proof, use a temporary product explicitly classified as a
   limited drop but missing its required timing metadata. Confirm it is excluded
   from customer surfaces and that the protected health response groups the
   stable error code with a plain-language remedy. Remove the temporary product
   from the Headless publication after recording the result.

Keep fixture, local HTTP/browser, shared-store, deployed-preview, and live
Shopify evidence labeled separately. A fixture result never satisfies the live
Shopify completion gate.

## Verification

Evidence labels are not interchangeable:

| Evidence class | What it establishes | Pre-C8 status |
| --- | --- | --- |
| Fixture | Deterministic behavior against supplied catalog/store data | Run locally |
| Local unit | Admission, freshness, namespace, webhook, cart, and renderer behavior in Node | Run locally |
| Local HTTP/browser | Customer-visible status, content type, layout, and interaction on a local fixture server | C6 evidence only; not rerun by C7 documentation work |
| Shared-store | Separate Node processes observe one Redis-protocol generation | Run locally against the fixture Redis seam |
| Deployed Preview | Vercel routing, managed environment, CDN, `waitUntil`, and real shared-store behavior | Not performed |
| Live Shopify | Real Headless acquisition, webhook, mutation, cart, and checkout behavior | Not performed |

Run the local repository gates:

```bash
node --test test/*.test.js
node scripts/validate-catalog.js
node scripts/audit-release.js
npm audit --omit=dev
node scripts/validate-shopify-integration.js --strict
node scripts/release-preflight.js --expected-head "$(git rev-parse HEAD)"
```

The strict Shopify validator is an external evidence gate. Record its actual
result for the current run. Missing Storefront access or an upstream failure
means live Shopify remains unverified; it does not authorize deployment,
environment changes, webhook registration, or Shopify mutation.

### Secret-safe release preflight

Run the preflight from the repository root with the exact intended release
commit:

```bash
node scripts/release-preflight.js --expected-head "$(git rev-parse HEAD)"
```

The command does not mutate Git, Shopify, Vercel, Resend, or the durable store.
It suppresses strict-validator output and reports only variable names grouped
under core configuration, operational configuration, contact delivery, release
configuration, Git state, strict Shopify validation, and external release
gates. It fails closed when:

- a required value is missing or an obvious placeholder;
- the durable-store pair is partial, duplicated, or uses a non-HTTPS URL;
- the Vercel Hobby cron differs from `/api/catalog-reconcile` at
  `0 0 * * *`;
- the derived catalog namespace is invalid or a manual alias does not match it;
- `HEAD` differs from `--expected-head` or the worktree is not clean; or
- strict Shopify validation fails.

Contact delivery is reported separately. Missing `RESEND_API_KEY`,
`CONTACT_FROM_EMAIL`, or `CONTACT_TO_EMAIL` does not mislabel core commerce
configuration, but it remains visible as incomplete contact evidence.

State meanings:

- `BLOCKED`: at least one required local/configuration/strict check failed.
- `READY_LOCAL`: required local checks passed, but owner-authorized O1/O2
  evidence is absent.
- `READY_TO_PUSH`: local checks passed and `--external-gate <path>` supplied a
  secret-free, commit-bound record of accepted Shopify catalog readiness plus
  the required variable names for both Production and Preview.

The external gate is a temporary JSON file outside the repository. It contains
names and statuses only—never values:

```json
{
  "schemaVersion": 1,
  "head": "<40-character release commit>",
  "shopifyCatalogReadiness": "accepted",
  "contactDelivery": "configured",
  "configuration": {
    "production": [
      "SHOPIFY_STORE_DOMAIN",
      "SHOPIFY_STOREFRONT_PRIVATE_TOKEN",
      "SHOPIFY_WEBHOOK_SECRET",
      "CATALOG_HEALTH_TOKEN",
      "CRON_SECRET",
      "KV_REST_API_URL",
      "KV_REST_API_TOKEN",
      "RESEND_API_KEY",
      "CONTACT_FROM_EMAIL",
      "CONTACT_TO_EMAIL",
      "VERCEL_ENV",
      "VERCEL_PROJECT_PRODUCTION_URL"
    ],
    "preview": [
      "SHOPIFY_STORE_DOMAIN",
      "SHOPIFY_STOREFRONT_PRIVATE_TOKEN",
      "SHOPIFY_WEBHOOK_SECRET",
      "CATALOG_HEALTH_TOKEN",
      "CRON_SECRET",
      "KV_REST_API_URL",
      "KV_REST_API_TOKEN",
      "RESEND_API_KEY",
      "CONTACT_FROM_EMAIL",
      "CONTACT_TO_EMAIL",
      "VERCEL_ENV",
      "VERCEL_DEPLOYMENT_ID"
    ]
  }
}
```

Use exactly one supported durable-store pair in each environment. If direct
contact delivery is excluded from the release, set `contactDelivery` to
`not-in-release` and omit the three contact variable names. The preflight
rejects unknown fields or variable names so a value-bearing evidence document
cannot silently qualify a release.

### C8 acceptance attempt — 2026-07-27

This attempt stopped at the first external boundary failure. No deployment,
environment change, webhook registration, Shopify mutation, live checkout,
push, or production-code remediation was performed.

| Evidence class | Observed result |
| --- | --- |
| Local unit | `node --test test/*.test.js` passed 158/158; catalog validation, release audit, and `npm audit --omit=dev` passed with zero vulnerabilities. |
| Local HTTP/browser | The existing fixture at `http://127.0.0.1:4176/products/heavy-cover-football` rendered HTTP-backed admitted product content with the expected title, `$5.00` customer price, available status, cart shell, and no browser warnings or errors. That fixture exposed one media item and no option groups, so it does not satisfy the deferred desktop/mobile option, multi-media, stale-cart, unavailable-state, or checkout matrix. |
| Shared-store | The local suite passed its Redis-protocol multi-process fixture coverage. Real Upstash Lua, TTL, fencing, and multi-instance behavior was not exercised. |
| Deployed Preview | Read-only Vercel inspection found no Preview carrying C1-C8. The latest Production deployment was commit `9c41f1f1c3a1f279b55ed3bf9285ad6025ff8de8`; the C8 anchor is local commit `92f3e7910e1fc8892eeebc060a3dbd3820e3b791`, 16 commits ahead of `origin/main`. No Preview deployment was authorized or created. |
| Live Shopify | `node scripts/validate-shopify-integration.js --strict` failed with `Shopify Storefront API query failed`. Storefront acquisition, signed webhook delivery, product mutation, quarantine, unpublish/delete, exact cart, nested rattle, and checkout handoff remain unverified. |

C8-R1 resolved the deployment-source blocker in commit
`92f3e7910e1fc8892eeebc060a3dbd3820e3b791`: the committed reconciliation
schedule is the Vercel Hobby-compatible daily `0 0 * * *` schedule and its
public regression test is committed with it.

Read-only Vercel environment inspection on 2026-07-27 showed the shared
Upstash/KV REST URL and token and the private Shopify Storefront token assigned
to both Production and Preview. It did not show `CATALOG_HEALTH_TOKEN`,
`SHOPIFY_WEBHOOK_SECRET`, or `CRON_SECRET`. No value was revealed or changed.
A Preview can exercise the existing Storefront and shared-store configuration,
but protected health/reconciliation and signed-webhook acceptance remain
blocked until those values are separately authorized and configured.

Human review of the exact C8 anchor through local Vercel Dev on 2026-07-27
stopped before deployment:

- `/api/catalog` and generic product routes returned HTTP 502. The server
  reported `The durable catalog store URL must use HTTPS.` The Preview
  environment values pulled by the CLI were unusable placeholders in the local
  process; this does not prove that Vercel would inject invalid values into a
  deployed Preview, but it prevents this local runtime from exercising the
  managed Storefront and Upstash configuration.
- The homepage featured-drop card remained hidden because it is revealed only
  after a current drop is admitted. Its absence visibly changed the hero
  structure during the owner's review.
- The shop discarded its static product cards and received no admitted Shopify
  products, leaving the collection empty apart from the catalog-unavailable
  state. The owner rejected that as a reviewable storefront.
- `contact.html` and `api/contact.js` are unchanged from deployed Production
  commit `9c41f1f1c3a1f279b55ed3bf9285ad6025ff8de8`. A valid local POST returned
  HTTP 503 `email_not_configured` because the Preview environment has no
  `CONTACT_FROM_EMAIL` or `RESEND_API_KEY`. Read-only Production logs contained
  no `/api/contact` request in the preceding seven days, so actual email
  delivery remains unverified.

These are failed C8 acceptance observations, not authorization to alter
production code. Per the C8 boundary, remediation requires a new bounded slice
before deployment acceptance resumes.

### C8-R2 Heartlander remediation — 2026-07-27

C8-R2 is a bounded production-code remediation slice created after the owner's
human review. It does not authorize deployment or Shopify mutation.

- The first focused regression failed because every limited-drop card used the
  hard-coded route `products/limited-drop`. The adapter now preserves the
  admitted Shopify product handle as `products/<exact-handle>`, allowing the
  Heartlander and future drops to have their own product URLs.
- Fixture and local unit coverage prove a compliant Heartlander record appears
  exactly once in Shop, remains the homepage drop, renders one ordered
  five-item Shopify gallery including video, exposes Color `Heartlander` and
  Weight `5/8 oz`, and preserves exact variant
  `gid://shopify/ProductVariant/51000785633447` at `$5.99` through the cart
  boundary.
- `node --test test/*.test.js` passed 164/164.
  `node scripts/validate-catalog.js`, `node scripts/audit-release.js`, and
  `npm audit --omit=dev` passed; the dependency audit reported zero
  vulnerabilities. `node scripts/validate-shopify-integration.js --strict`
  still failed with `Shopify Storefront API query failed`, so none of these
  local results satisfy live Shopify acceptance.
- A desktop local-browser fixture at `http://127.0.0.1:4178/` used the five
  media items observed on Shopify's public `limited-drop.js` product response,
  the intended title `5/8 oz PeeWee Football HD — Heartlander`, and the exact
  live variant. The homepage feature rendered, Shop contained one dedicated
  Heartlander card, the product route exposed all five gallery positions and
  advanced from the lead image to the video, and the local cart displayed the
  exact options and `$5.99` subtotal without browser warnings or errors.
  The intended title, handle, and valid end time in that fixture are proposed
  state, not proof that Shopify contains them.
- Owner review requested the complete product media on the homepage card.
  The card now reads the same admitted ordered Shopify media used by the product
  route and exposes previous/next buttons, a position counter, keyboard arrow
  navigation, image zoom, and playable video without changing its approved
  card proportions. Local desktop and 375-pixel mobile browser checks advanced
  through all five positions, wrapped from the final image to the first,
  rendered the 57-second video controls, preserved the exact cart line, showed
  no horizontal overflow, and produced no browser warnings or errors.

Read-only live data still leaves two owner-controlled Shopify corrections:

1. The published product is titled `Limited Drop`; rename it to the approved
   specific Heartlander product title.
2. The production catalog reported no `drop_ends_at`. Set a valid end later
   than `drop_starts_at`; the universal catalog intentionally quarantines a
   limited drop without a complete valid window.

The five customer-uploaded media items are present in Shopify already. No
re-upload or repository image copy is required. The two Shopify corrections
above require separate explicit owner authorization at action time.

### C8-R3 universal rich media and homepage gallery hardening — 2026-07-27

C8-R3 closes repository gaps C8-G01 and C8-G02 without changing Shopify,
Vercel, Resend, or deployment state.

- The homepage limited-drop gallery now preserves admitted `model-3d` media in
  order through the same accessible `View 3D model` link precedent used by the
  generic product page. Image zoom remains image-only.
- Focused DOM tests execute the public gallery mount and protect ordered image,
  native-video, external-video, and model presentation; accessible position
  labels and counters; previous/next and keyboard wraparound; video pause only
  when leaving its active slide; image-only zoom wiring; and single fallback or
  missing-media card behavior.
- `node --test test/homepage-limited-drop-gallery.test.js` passed 6/6.
  `node --test test/*.test.js` passed 168/168.
  `node scripts/validate-catalog.js`, `node scripts/audit-release.js`,
  `npm audit --omit=dev`, and `git diff --check` passed; the dependency audit
  reported zero vulnerabilities.
- A fresh local-browser fixture at `http://127.0.0.1:4178/` rendered all five
  Heartlander media items on desktop and a 375-pixel mobile viewport. Both
  previous/next buttons and left/right keyboard navigation wrapped in both
  directions; image zoom opened and closed; the native video played and paused
  after advancing away; and neither viewport produced horizontal overflow,
  console warnings, or console errors.

These fixture and local-browser results prove the C8-R3 repository boundary
only. They do not satisfy live Shopify, deployed Preview, or Production
acceptance.

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
