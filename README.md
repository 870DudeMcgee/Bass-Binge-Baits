# Bass Binge Website

Static four-page marketing + commerce site for Bass Binge Baits.

## Pages

- Home: `index.html`
- Shop: `shop.html`
- About: `about.html`
- Contact: `contact.html`

## Quick Start

Open `index.html` directly in a browser for static preview, or run a simple local server:

```bash
cd /Users/jewelbait/Bass\ Binge\ Website
python3 -m http.server 8080
```

Then visit `http://localhost:8080`.

## Shopify Setup

The shop page now keeps product selection and cart review on the Bass Binge site, then sends customers to Shopify only for secure checkout.

Shopify is the live source for product prices, variant availability, assigned variant images, and checkout merchandise IDs. `api/catalog.js` reads Shopify through the Storefront API, normalizes it into the approved storefront shape, and caches it for 45 seconds. `assets/js/catalog.js` remains a temporary browser fallback and supplies presentation metadata such as local page paths and swatch colors.

Checkout is enabled only when every selected color/weight resolves to an available Shopify variant. `api/shopify-cart.js` creates a Storefront Cart and returns Shopify's checkout URL. Rattle selections use a separate Shopify variant and are attached as nested child lines beneath their jig parent.

Public products and basic cart creation work through Shopify's tokenless Storefront API. Configure the Headless private token to enable product tags and limited-drop metafields without exposing a credential to the browser:

```bash
SHOPIFY_STORE_DOMAIN=bassbingebaits.myshopify.com
SHOPIFY_STOREFRONT_API_VERSION=2026-01
SHOPIFY_STOREFRONT_PRIVATE_TOKEN=shpss_xxxxxxxxx
```

The Headless storefront needs product, inventory, tag, metafield, and cart access. Publish sellable products, the hidden Rattle Add-on, and limited drops to that Headless sales channel.

For client access and the one-time merchant handoff, use
`docs/shopify-client-access-request.md` and
`docs/shopify-implementation-runbook.md`. Never request or share the merchant's
Shopify password.

Validate catalog data after editing it:

```bash
node scripts/validate-catalog.js
```

Run both checks before release:

```bash
node scripts/validate-catalog.js
node scripts/audit-release.js
node scripts/validate-shopify-integration.js
```

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
