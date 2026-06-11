# Bass Binge Context

## Domain Language

**Bass Binge Product Catalog**
The source of truth for sellable Bass Binge jigs, their public product copy, selectable options, product images, swatches, prices, and checkout mappings.

**Jig**
A sellable lure family shown to shoppers. Current jigs include PeeWee Football, PeeWee Football HD, PeeWee Spider HD, and Heavy Cover Football.

**Jig Build**
The exact shopper selection for a jig: jig, color, weight, optional rattle selection, quantity, image, price, and checkout mapping.

**Color**
A selectable jig color. A color needs a stable key, shopper-facing name, swatch color, product image, search terms, and checkout mapping where checkout is supported.

**Weight**
A selectable jig size such as `7/16`, `5/16`, `3/16`, `1/2`, or `3/4` ounce. Some jigs have one weight; some expose multiple weights.

**Rattle Option**
A shopper selection for whether a jig build includes a rattle. If the rattle option changes price, checkout must map that selection to Shopify data instead of relying only on local price math.

**Product Gallery**
The image carousel on product pages. It shows product images for the currently configured jig and should stay synchronized with color selection.

**Cart Line**
The stored representation of a jig build and quantity in the Bass Binge site cart.

**Checkout Line**
A cart line that has enough Shopify mapping to be converted into a Shopify checkout URL.

**Page Shell**
The repeated site chrome shared across pages: header, navigation, footer, cart drawer markup, and common script includes.
