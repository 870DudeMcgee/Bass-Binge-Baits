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

Product handles, variant IDs, color names, prices, and checkout URL generation live in `assets/js/shopify-buy-button.js`. This static site does not store Shopify admin credentials, passwords, or private API tokens. If Shopify products or variants change, refresh the embedded catalog in that file or replace it with Storefront API-backed catalog loading.

For a Storefront API checkout handoff, add a public Storefront access token to `SHOPIFY_STORE.storefrontAccessToken` in `assets/js/shopify-buy-button.js`. Without that public token, the checkout button falls back to a Shopify cart permalink built from the embedded variant IDs.

## Form Setup

The contact form is placeholder-only and currently handled client-side.
Hook it to your preferred endpoint (Formspree, Basin, or a Vercel Serverless Function).

## Deploy To Vercel

1. Import this folder into Vercel.
2. Confirm production domain.
3. Update canonical domain values in `robots.txt` and `sitemap.xml`.
