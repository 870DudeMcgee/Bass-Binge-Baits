'use strict';

const RETURNS_URL = 'https://www.bassbingebaits.com/returns';
const BUSINESS_DAYS = Object.freeze([
  'https://schema.org/Monday',
  'https://schema.org/Tuesday',
  'https://schema.org/Wednesday',
  'https://schema.org/Thursday',
  'https://schema.org/Friday',
]);

const BAIT_HANDLES = new Set([
  '5-16-pee-wee-flip', '7-16-oz-pee-wee-flip', 'chopped-craw-6-pack',
  '5-8-oz-heavy-cover-football', 'pee-wee-football', '5-16-oz-finesse-jig',
  'limited-drop', '5-16-peewee-spider-hd-finesse-cut',
  '7-16-oz-peewee-football-jig', '3-4-oz-football-jig', 'premium-football-jig'
]);

// Shopify profile assignments reviewed 2026-09-07. The heavyweight sweatshirt
// is assigned to the T-shirt profile, so its checkout shipping rate is $4.95.
const PRINTFUL_RATES = new Map([
  ['lake-life-bucket-hat', '4.69'], ['camouflage-trucker-hat-1', '4.69'], ['bass-binge-baits-access-cap', '4.69'], ['bass-binge-baits-hat', '4.69'], ['bass-binge-baits-trucker-cap', '4.69'], ['coastal-washed-cap', '4.69'], ['retro-foam-trucker-hat', '4.69'], ['bass-binge-baits-embroidered-beanie-1', '4.69'],
  ['performance-crew-neck-t-shirt', '4.95'], ['lake-life-classic-tee', '4.95'], ['retro-3-4-sleeve-raglan-shirt', '4.95'], ['bass-binge-baits-ringer-t-shirt', '4.95'], ['womens-relaxed-t-shirt', '4.95'], ['short-sleeve-t-shirt-1', '4.95'], ['hooded-long-sleeve-tee', '4.95'],
  ['premium-full-zip-hoodie', '8.79'], ['bass-binge-hoodie', '8.79'], ['bass-binge-baits-hoodie-1', '8.79'], ['bass-binge-baits-premium-sweatshirt', '8.79'], ['heavyweight-hooded-sweatshirt-independent-trading-co-ind4000-2', '4.95'], ['bass-binge-baits-windbreaker', '8.79'],
  ['tote-bag', '4.69'], ['lake-life-clear-tote-bag', '8.29'], ['mouse-pad', '4.69'], ['can-cooler', '4.69'], ['magnet', '4.69'],
  ['stainless-steel-water-bottle', '10.89'], ['stainless-steel-tumbler', '10.89'], ['flip-straw-water-bottle', '9.29']
]);

const MUG_RATES = Object.freeze({
  '11 oz': '6.69',
  '15 oz': '7.29',
  '20 oz': '8.79',
});
const MUG_HANDLES = new Set(['mug-with-color-inside-1', 'white-glossy-mug-2', 'white-glossy-mug']);
const BAIT_REGIONS = Object.freeze(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);

function selectedOption(variant, name) {
  const option = (variant && variant.selectedOptions || []).find((entry) => String(entry && entry.name || '').toLowerCase() === name);
  return option && String(option.value || '').trim();
}

function shippingRate(product, variant) {
  if (BAIT_HANDLES.has(product && product.handle)) {
    return { price: '8.99', handling: [1, 3], transit: [3, 5], regions: BAIT_REGIONS, freeThreshold: '50' };
  }
  if (MUG_HANDLES.has(product && product.handle)) {
    const price = MUG_RATES[selectedOption(variant, 'size')];
    return price ? { price, handling: [2, 5], transit: [1, 8] } : null;
  }
  const price = PRINTFUL_RATES.get(product && product.handle);
  return price ? { price, handling: [2, 5], transit: [1, 8] } : null;
}

function shippingDetailsForOffer(rate, variant) {
  if (!rate) return null;
  const amount = Number(variant && variant.price && variant.price.amount);
  const freeThreshold = Number(rate.freeThreshold);
  const shippingPrice = Number.isFinite(freeThreshold) && Number.isFinite(amount) && amount >= freeThreshold ? '0.00' : rate.price;
  const shippingDestination = rate.regions
    ? rate.regions.map(region => ({ '@type': 'DefinedRegion', addressCountry: 'US', addressRegion: region }))
    : { '@type': 'DefinedRegion', addressCountry: 'US' };
  return {
    '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: shippingPrice, currency: 'USD' },
    shippingDestination,
    deliveryTime: {
      '@type': 'ShippingDeliveryTime',
      businessDays: { '@type': 'OpeningHoursSpecification', dayOfWeek: BUSINESS_DAYS },
      handlingTime: { '@type': 'QuantitativeValue', minValue: rate.handling[0], maxValue: rate.handling[1], unitCode: 'DAY' },
      transitTime: { '@type': 'QuantitativeValue', minValue: rate.transit[0], maxValue: rate.transit[1], unitCode: 'DAY' },
    },
  };
}

function merchantReturnPolicy() {
  return {
    '@type': 'MerchantReturnPolicy',
    itemCondition: 'https://schema.org/NewCondition',
    applicableCountry: 'US',
    returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
    merchantReturnDays: 7,
    returnMethod: 'https://schema.org/ReturnByMail',
    returnFees: 'https://schema.org/ReturnFeesCustomerResponsibility',
    merchantReturnLink: RETURNS_URL,
  };
}

function missingShippingPolicyVariants(catalog) {
  if (!catalog || catalog.schemaVersion !== 2 || !Array.isArray(catalog.products)) {
    throw new Error('Admitted catalog unavailable');
  }
  const missing = [];
  for (const product of catalog.products) {
    if (!product || product.presentation?.kind === 'hidden-add-on') continue;
    const variants = Array.isArray(product.variants) && product.variants.length ? product.variants : [null];
    for (const variant of variants) {
      if (!shippingRate(product, variant)) {
        missing.push({
          handle: String(product.handle || 'unknown-product'),
          variantId: String(variant && variant.id || 'no-variant'),
        });
      }
    }
  }
  return missing;
}

module.exports = {
  BAIT_HANDLES,
  BAIT_REGIONS,
  BUSINESS_DAYS,
  MUG_HANDLES,
  MUG_RATES,
  PRINTFUL_RATES,
  merchantReturnPolicy,
  missingShippingPolicyVariants,
  shippingDetailsForOffer,
  shippingRate,
};
