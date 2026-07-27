# Bass Binge Website

Static marketing pages with Shopify-backed catalog, product, cart, and checkout
functions for Bass Binge Baits.

## Pages

- Home: `index.html`
- Shop: `shop.html`
- About: `about.html`
- Contact: `contact.html`

## Quick Start

Open `index.html` directly for a presentation-only preview, or serve the static
files locally:

```bash
cd /Users/jewelbait/Desktop/Bass_Binge_Baits
python3 -m http.server 8080
```

Then visit `http://localhost:8080`. A static server does not execute the Vercel
Functions or the `/products/:handle` rewrite, so this is not catalog, cart, or
product-route acceptance.

## Shopify Catalog Architecture

Shopify's configured Headless publication is the source of truth for admitted
product identity, public copy, media, exact options and variants, price,
availability, and checkout merchandise IDs. `/api/catalog` acquires every page
of the Storefront connections, validates a versioned `CatalogEnvelope`, and
stores only a complete admitted generation.

The last validated envelope lives in one Redis-compatible durable backend.
Production and each Preview deployment derive separate schema/shop/trust-domain
namespaces, so they cannot alias one another. Catalog reads use a 45-second
fresh window and a bounded five-minute stale window. Signed webhooks mark the
shared generation dirty, and protected reconciliation is the missed-event
backstop. If no admitted generation is usable, customer surfaces fail closed;
`assets/js/catalog.js` starts empty and is not a fallback product catalog.

Every `/products/:handle` request rewrites to the generic admitted product
handler. No `products/<handle>.html` file or handle-keyed local record can
bypass deletion, quarantine, or expired-stale behavior. The shop, product page,
browser cart, and server cart all reconcile exact admitted Shopify variant
identity and money before checkout. Rattle selections remain a validated hidden
add-on nested beneath their eligible jig parent.

Configure the server-only Storefront and durable-state values:

```bash
SHOPIFY_STORE_DOMAIN=bassbingebaits.myshopify.com
SHOPIFY_STOREFRONT_API_VERSION=2026-01
SHOPIFY_STOREFRONT_PRIVATE_TOKEN=shpss_xxxxxxxxx
KV_REST_API_URL=https://example.upstash.io
KV_REST_API_TOKEN=xxxxxxxxx
SHOPIFY_WEBHOOK_SECRET=xxxxxxxxx
CATALOG_HEALTH_TOKEN=xxxxxxxxx
CRON_SECRET=xxxxxxxxx
```

The equivalent `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` names are also supported. Leave
`CATALOG_CACHE_NAMESPACE` unset; a manual value is accepted only when it exactly
matches the namespace derived from the schema, Shopify shop, and deployment
trust identity. Never expose these values to browser code.

The Headless storefront needs product, inventory, tag, metafield, and cart
access. Publish sellable products, the hidden Rattle Add-on, and limited drops
to that sales channel.

For client access and the one-time merchant handoff, use
`docs/shopify-client-access-request.md` and
`docs/shopify-implementation-runbook.md`. Never request or share the merchant's
Shopify password.

## Release Evidence

Keep these evidence classes separate:

- Fixture tests prove deterministic behavior against supplied data.
- Local unit and local HTTP/browser checks prove the current checkout and
  rendered behavior on this machine.
- Shared-store tests prove separate Node processes can observe one durable
  generation through the Redis protocol seam.
- A deployed Preview proves Vercel routing, environment, CDN, and managed-store
  behavior only after an authorized deployment.
- Live Shopify proof requires the configured Headless storefront and real
  merchant operations; local fixtures never satisfy it.

Run the repository checks before release:

```bash
node --test test/*.test.js
node scripts/validate-catalog.js
node scripts/audit-release.js
npm audit --omit=dev
node scripts/validate-shopify-integration.js --strict
```

The strict Shopify validator is an external evidence gate. A local failure
because Storefront access is unavailable must be reported as unverified; it is
not permission to deploy, change environment variables, or mutate Shopify.

## Form Setup

The contact form posts to `api/contact.js`, a Vercel Function that sends email through Resend. The Resend API key stays server-side and is never exposed to the browser. If the function is not configured yet or delivery fails, the browser falls back to a prefilled email draft.

Set these Vercel environment variables for Production and Preview:

```bash
RESEND_API_KEY=re_xxxxxxxxx
CONTACT_FROM_EMAIL="Bass Binge Baits <contact@your-verified-domain.com>"
CONTACT_TO_EMAIL=Bassbingebaits@gmail.com
```

`CONTACT_FROM_EMAIL` must use a sending address/domain verified in Resend. After setting the variables, redeploy the Vercel project and submit a test message from the live contact page.

## Deploy To Vercel

1. Import this folder into Vercel.
2. Confirm production domain.
3. Update canonical domain values in `robots.txt` and `sitemap.xml`.
