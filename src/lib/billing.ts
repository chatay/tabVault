export function getCheckoutUrl(): string {
  return import.meta.env.WXT_LEMONSQUEEZY_CHECKOUT_URL || '';
}
