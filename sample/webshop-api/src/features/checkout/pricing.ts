/** Orders from this total on, after the discount, ship for free (cents). */
export const FREE_SHIPPING_FROM = 5000;

/** The flat shipping cost of a smaller order (cents). */
export const SHIPPING_COST = 499;

export type PricedLine = { unitPrice: number; quantity: number };

export type CouponTerms = {
  type: 'Percentage' | 'Fixed';
  value: number;
  minOrderTotal: number;
  active: boolean;
  validFrom?: Date | null;
  validUntil?: Date | null;
  maxRedemptions?: number | null;
  redemptions: number;
};

export type OrderTotals = {
  subtotal: number;
  discount: number;
  shippingCost: number;
  total: number;
};

/**
 * Prices an order in cents: the lines, the discount of the coupon, and the
 * shipping, which is free from a total on.
 */
export function priceOrder(
  lines: PricedLine[],
  coupon?: Pick<CouponTerms, 'type' | 'value'> | null
): OrderTotals {
  const subtotal = lines.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0
  );

  let discount = 0;
  if (coupon?.type === 'Percentage') {
    discount = Math.floor((subtotal * Math.min(coupon.value, 100)) / 100);
  } else if (coupon?.type === 'Fixed') {
    discount = Math.min(coupon.value, subtotal);
  }

  const discounted = subtotal - discount;
  const shippingCost =
    discounted >= FREE_SHIPPING_FROM || lines.length === 0 ? 0 : SHIPPING_COST;

  return {
    subtotal,
    discount,
    shippingCost,
    total: discounted + shippingCost
  };
}

/**
 * Why the coupon cannot be applied to an order of the subtotal, or null when
 * it can.
 */
export function couponProblem(
  coupon: CouponTerms,
  subtotal: number,
  now: Date = new Date()
): string | null {
  if (!coupon.active) {
    return 'The coupon is not active';
  }
  if (coupon.validFrom && coupon.validFrom > now) {
    return 'The coupon is not valid yet';
  }
  if (coupon.validUntil && coupon.validUntil < now) {
    return 'The coupon has expired';
  }
  if (
    coupon.maxRedemptions !== null &&
    coupon.maxRedemptions !== undefined &&
    coupon.redemptions >= coupon.maxRedemptions
  ) {
    return 'The coupon has been fully redeemed';
  }
  if (subtotal < coupon.minOrderTotal) {
    return `The coupon needs an order of at least ${(coupon.minOrderTotal / 100).toFixed(2)} EUR`;
  }

  return null;
}
