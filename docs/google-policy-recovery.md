# Google product policy recovery

Updated 2026-09-11. The canonical settled commerce facts remain at
`/Users/josh/.codex/worktrees/a000/Dude McGee Website/docs/commerce-reference.md`.

This change moves the existing exact Bass shipping assignments into
`lib/product-policies.js` so the Google feed and product Offer schema use one
source. Existing feed rates, supported regions, $50 bait threshold, delivery
timings, and the heavyweight sweatshirt's unusual $4.95 T-shirt-profile rate are
preserved. The three mug handles remain size-specific at $6.69, $7.29, or $8.79.

Known Offer schema now publishes the same shipping cost and scope. A single bait
item priced at least $50 receives a zero schema shipping rate under the established
threshold; this does not claim a verified mixed-cart calculation. Every public
Offer publishes the settled US seven-day mail-return policy with customer-paid
return fees and the public `/returns` link. The optional `restockingFee` encoding
and `refundType` are omitted; the visible 10% restocking policy is unchanged.

Unknown products remain sellable and continue to render/feed without invented
shipping. `scripts/check-product-policy-readiness.js` is the fail-visible gate: it
reports every unmapped public variant and exits nonzero. The unresolved Buffet
Craw assignment must remain in that report until its actual Shopify profile is
verified. Hidden add-ons are excluded from readiness just as they are from public
product discovery.

Deployment, account edits, Buffet Craw profile verification, and Google
reprocessing are separate pending work.

## Separate indexing evidence

The image-discovery change is deployed at `9ad1bff` and READY. Its public audit
observed 44 products / 1,013 variants, four hidden add-on variants, 50 sitemap
URLs with 467 images, and 9,266 feed additional-image fields. The only feed
shipping omissions remain the six unresolved Buffet Craw variants.

The Bass Merchant website is currently Verified/Claimed on the brand domain.
However, Search Console reports
`https://www.bassbingebaits.com/products/white-glossy-mug` as Discovered,
currently not indexed, with no crawl date and no referring page; its sitemap is
the discovery source. An indexing request is pending the live test. A current
organic result points to the shop.app representation instead of the brand URL.
That is a separate crawling/canonical-discovery issue and is not resolved merely
by adding shipping or return policy markup.


## Buffet Craw assignment verified September 11

After owner passkey verification, Shopify General profile `104202043559`
showed Bass Binge Buffet Craw 8 pack and all six colors assigned. Its Base shop
Domestic zone lists 50 of 62 states, Standard $8.99, free from $50, and 3–5
business-day transit. The product now uses the existing bait policy in
`lib/product-policies.js`, shared by the feed and Offer schema. No Shopify
rates or assignments were changed. Existing published bait handling remains
1–3 business days. This resolves the previously unknown assignment above;
Google approval and organic indexing remain separate outcomes.
