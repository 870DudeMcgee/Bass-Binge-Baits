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

## Form Setup

The contact form is placeholder-only and currently handled client-side.
Hook it to your preferred endpoint (Formspree, Basin, or a Vercel Serverless Function).

## Deploy To Vercel

1. Import this folder into Vercel.
2. Confirm production domain.
3. Update canonical domain values in `robots.txt` and `sitemap.xml`.
