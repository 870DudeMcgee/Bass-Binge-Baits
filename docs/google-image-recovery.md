# Google image discovery recovery

Updated 2026-09-11. This change is limited to image discovery for the admitted
public Bass Binge Baits catalog. Shipping, pricing, product schema, return policy,
and hidden add-on admission are unchanged.

`lib/sitemap-route.js` now publishes the Google image sitemap namespace and every
valid HTTP(S) image supplied by product media or a variant-only image. It merges
duplicate product handles, deduplicates repeated URLs, escapes XML values, and
continues to exclude products classified as `hidden-add-on`.

`lib/google-product-feed.js` now adds up to 10 deduplicated
`additional_image_link` values per offer from those same real catalog image
sources. The selected offer image is excluded. No image URL is generated or
rewritten.

Focused regressions cover XML escaping, media-type filtering, duplicate products
and images, variant-only images, hidden add-ons, primary-image exclusion, and the
10-image feed limit. Deployment and Google processing remain separate follow-up
work.

For settled cross-store commerce facts and unresolved policy questions, reuse
the canonical reference at
`/Users/josh/.codex/worktrees/a000/Dude McGee Website/docs/commerce-reference.md`.
