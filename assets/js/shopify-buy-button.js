const SHOPIFY_CONFIG = {
  domain: 'example.myshopify.com',
  storefrontAccessToken: 'REPLACE_WITH_STOREFRONT_ACCESS_TOKEN',
  products: {
    'shallow-grinder': 'REPLACE_WITH_PRODUCT_ID_1',
    'deep-dragger': 'REPLACE_WITH_PRODUCT_ID_2',
    'grass-punch': 'REPLACE_WITH_PRODUCT_ID_3'
  }
};

const slots = document.querySelectorAll('[data-buy-button]');

if (slots.length) {
  const hasConfigValues =
    SHOPIFY_CONFIG.domain !== 'example.myshopify.com' &&
    SHOPIFY_CONFIG.storefrontAccessToken !== 'REPLACE_WITH_STOREFRONT_ACCESS_TOKEN';

  if (!hasConfigValues) {
    console.warn('Shopify Buy Button placeholders are still in place.');
    slots.forEach((slot) => {
      slot.innerHTML = '<small>Add Shopify credentials to enable direct checkout.</small>';
    });
  } else {
    loadShopifyClient();
  }
}

function loadShopifyClient() {
  const existing = document.querySelector('script[data-shopify-buy-sdk]');
  if (existing) {
    mountBuyButtons();
    return;
  }

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://sdks.shopifycdn.com/buy-button/latest/buy-button-storefront.min.js';
  script.setAttribute('data-shopify-buy-sdk', 'true');
  script.onload = mountBuyButtons;
  script.onerror = () => {
    console.error('Shopify Buy Button SDK failed to load.');
  };

  document.head.appendChild(script);
}

function mountBuyButtons() {
  if (!window.ShopifyBuy) {
    return;
  }

  const client = window.ShopifyBuy.buildClient({
    domain: SHOPIFY_CONFIG.domain,
    storefrontAccessToken: SHOPIFY_CONFIG.storefrontAccessToken
  });

  window.ShopifyBuy.UI.onReady(client).then((ui) => {
    slots.forEach((slot) => {
      const key = slot.getAttribute('data-buy-button');
      const productId = SHOPIFY_CONFIG.products[key];

      if (!productId || productId.includes('REPLACE_WITH_')) {
        slot.innerHTML = '<small>Missing product ID in config.</small>';
        return;
      }

      ui.createComponent('product', {
        id: productId,
        node: slot,
        moneyFormat: '%24%7B%7Bamount%7D%7D',
        options: {
          product: {
            contents: {
              img: false,
              title: false,
              price: false,
              button: true,
              buttonWithQuantity: false,
              quantity: false,
              description: false
            },
            text: {
              button: 'Add To Cart'
            }
          },
          cart: {
            text: {
              title: 'Your Box'
            }
          },
          toggle: {
            sticky: true
          }
        }
      });
    });
  });
}
