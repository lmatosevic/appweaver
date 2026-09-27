import {
  CouponTerms,
  couponProblem,
  FREE_SHIPPING_FROM,
  priceOrder,
  SHIPPING_COST
} from '@/features/checkout/pricing';

const coupon = (terms: Partial<CouponTerms> = {}): CouponTerms => ({
  type: 'Percentage',
  value: 10,
  minOrderTotal: 0,
  active: true,
  redemptions: 0,
  ...terms
});

describe('priceOrder', () => {
  test('adds up the lines', () => {
    const totals = priceOrder([
      { unitPrice: 1000, quantity: 2 },
      { unitPrice: 2500, quantity: 1 }
    ]);

    expect(totals.subtotal).toBe(4500);
  });

  test('charges shipping below the free shipping total', () => {
    const totals = priceOrder([{ unitPrice: 1499, quantity: 1 }]);

    expect(totals).toEqual({
      subtotal: 1499,
      discount: 0,
      shippingCost: SHIPPING_COST,
      total: 1499 + SHIPPING_COST
    });
  });

  test('ships for free from the free shipping total', () => {
    const totals = priceOrder([{ unitPrice: FREE_SHIPPING_FROM, quantity: 1 }]);

    expect(totals.shippingCost).toBe(0);
  });

  test('rounds a percentage discount down to whole cents', () => {
    const totals = priceOrder([{ unitPrice: 12999, quantity: 1 }], coupon());

    expect(totals.discount).toBe(1299);
    expect(totals.total).toBe(11700);
  });

  test('never discounts more than the subtotal', () => {
    const totals = priceOrder(
      [{ unitPrice: 300, quantity: 1 }],
      coupon({ type: 'Fixed', value: 500 })
    );

    expect(totals.discount).toBe(300);
    expect(totals.total).toBe(SHIPPING_COST);
  });

  test('decides the free shipping after the discount', () => {
    const totals = priceOrder(
      [{ unitPrice: FREE_SHIPPING_FROM, quantity: 1 }],
      coupon({ type: 'Fixed', value: 100 })
    );

    expect(totals.shippingCost).toBe(SHIPPING_COST);
  });
});

describe('couponProblem', () => {
  const now = new Date('2026-09-27T12:00:00.000Z');

  test('accepts a valid coupon', () => {
    expect(couponProblem(coupon(), 1000, now)).toBeNull();
  });

  test('rejects an inactive coupon', () => {
    expect(couponProblem(coupon({ active: false }), 1000, now)).toBe(
      'The coupon is not active'
    );
  });

  test('rejects a coupon outside of its validity', () => {
    const early = coupon({ validFrom: new Date('2026-10-01T00:00:00.000Z') });
    const late = coupon({ validUntil: new Date('2026-09-01T00:00:00.000Z') });

    expect(couponProblem(early, 1000, now)).toBe('The coupon is not valid yet');
    expect(couponProblem(late, 1000, now)).toBe('The coupon has expired');
  });

  test('rejects a fully redeemed coupon', () => {
    expect(
      couponProblem(coupon({ maxRedemptions: 5, redemptions: 5 }), 1000, now)
    ).toBe('The coupon has been fully redeemed');
  });

  test('rejects an order below the minimum total', () => {
    expect(couponProblem(coupon({ minOrderTotal: 3000 }), 2999, now)).toBe(
      'The coupon needs an order of at least 30.00 EUR'
    );
  });
});
