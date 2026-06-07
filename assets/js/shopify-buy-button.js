const SHOPIFY_STORE = {
  domain: 'bassbingebaits.myshopify.com',
  products: {
    'peewee-spider-hd-5-16': '5-16-peewee-spider-hd-finesse-cut',
    'peewee-football-hd-1-2': 'premium-football-jig',
    'heavy-cover-football-3-4': '3-4-oz-football-jig',
    'peewee-football-7-16': '7-16-oz-peewee-football-jig'
  }
};

document.querySelectorAll('[data-shopify-product]').forEach((link) => {
  const key = link.getAttribute('data-shopify-product');
  const handle = SHOPIFY_STORE.products[key];

  if (!handle) {
    return;
  }

  link.href = `https://${SHOPIFY_STORE.domain}/products/${handle}`;
});
