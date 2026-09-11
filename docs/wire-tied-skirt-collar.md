# Wire-tied skirt collar

The product page offers an independent No / Yes (+$2.00) choice on every product
whose admitted presentation enables rattles, including limited drops. The default
is No. Each selected jig receives one $2 collar upgrade. Rattles remain optional.

Shopify setup:

- Product title/type: Wire-tied skirt collar add-on
- Handle: `wire-tied-skirt-collar-add-on`
- One variant at USD 2.00
- Publish only to Bass Binge Baits Headless; activate after deploying the feature
- Inventory is not tracked for this made-to-order upgrade; jig stock remains tracked
- The add-on is hidden from collections, product routes, sitemap, and Google feeds

Checkout attaches collar and rattle lines beneath the exact jig line. The jig also
has a visible `Wire-tied skirt collar: Yes` property for fulfillment. Quantity and
removal affect the entire configuration. Saved carts preserve the collar choice.
A missing, unavailable, or differently priced collar cannot be checked out.

The existing rattle product has four variants. Checkout validates the exact variant
selected by the catalog projection against the current admitted rattle product.
The original Shopify base money is preserved without decimal-string conversion.

Verification: `node --test test/*.test.js`, catalog/release audits, dependency audit,
and browser checks for independent choices, combined total, reload, and quantities.
The local strict Storefront validator uses a channel that does not expose the
existing Headless-only rattle; use production catalog/checkout checks to verify
Headless behavior. This is not proof that the local strict check passed.
