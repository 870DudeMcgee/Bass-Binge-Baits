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

Product handles, variant IDs, color names, swatches, image paths, weights, and prices live in `assets/js/catalog.js`. Cart persistence, cart rendering, legacy cart migration, and Shopify cart permalink generation live in `assets/js/cart-checkout.js`. This static site does not store Shopify admin credentials, passwords, or private API tokens. If Shopify products or variants change, refresh the embedded catalog or replace it with Storefront API-backed catalog loading.

Checkout is enabled only for cart lines that have verified Shopify variant mapping in `assets/js/catalog.js`. Selections without mapping stay in the local cart, but checkout is blocked until the mapping is added.

Validate catalog data after editing it:

```bash
node scripts/validate-catalog.js
```

Run both checks before release:

```bash
node scripts/validate-catalog.js
node scripts/audit-release.js
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
