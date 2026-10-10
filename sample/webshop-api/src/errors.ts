import { defineErrors } from '@appweaver/core';

/** The error codes of the webshop, returned as the `code` of its error responses. */
export const ShopErrors = defineErrors({
  ProductUnavailable: { status: 400, title: 'Product unavailable' },
  OutOfStock: { status: 409, title: 'Product out of stock' },
  CouponInvalid: { status: 400, title: 'Invalid coupon' },
  OrderStatusConflict: { status: 409, title: 'Order status conflict' },
  AlreadyReviewed: { status: 409, title: 'Product already reviewed' }
});
