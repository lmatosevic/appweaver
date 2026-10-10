import { randomBytes } from 'node:crypto';
import {
  ApplicationError,
  AuthUser,
  ErrorCode,
  Events,
  RequestError
} from '@appweaver/common';
import {
  CacheService,
  inject,
  injectService,
  runTransaction
} from '@appweaver/core';
import db from '@db/client';
import { Coupon, Prisma } from '@db/client/client';
import { Order, OrderSingle } from '@/types';
import { ShopErrors } from '@/errors';
import { couponProblem, priceOrder } from './pricing';

export type ShippingAddress = {
  recipient: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
};

export type CheckoutRequest = {
  items: { product: number; quantity: number }[];
  couponCode?: string;
  addressId?: number;
  shippingAddress?: ShippingAddress;
  note?: string;
};

/**
 * Places an order in one transaction: the products are checked and their
 * stock reserved, the coupon is applied and redeemed, and the prices are
 * copied onto the order lines. The order then waits for its payment, which the
 * payment worker picks up from the resource event emitted once it commits.
 */
export async function checkout(
  customer: AuthUser,
  request: CheckoutRequest
): Promise<OrderSingle> {
  const shippingAddress = await resolveAddress(customer, request);
  const quantities = mergeLines(request.items);

  return runTransaction(async (tx: Prisma.TransactionClient) => {
    const products = await tx.product.findMany({
      where: { id: { in: [...quantities.keys()] }, status: 'Active' }
    });
    for (const productId of quantities.keys()) {
      if (!products.some((product) => product.id === productId)) {
        throw new ApplicationError(
          ShopErrors.ProductUnavailable,
          `Product ${productId} is not available`,
          { productId }
        );
      }
    }

    // A conditional decrement, so two checkouts never sell the same last item
    for (const product of products) {
      const quantity = quantities.get(product.id)!;
      const reserved = await tx.product.updateMany({
        where: { id: product.id, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } }
      });
      if (reserved.count === 0) {
        throw new ApplicationError(
          ShopErrors.OutOfStock,
          `Only ${product.stock} left of ${product.name}`,
          { productId: product.id, stock: product.stock }
        );
      }
    }

    const lines = products.map((product) => ({
      productId: product.id,
      productName: product.name,
      sku: product.sku,
      unitPrice: product.price,
      quantity: quantities.get(product.id)!,
      lineTotal: product.price * quantities.get(product.id)!
    }));

    let coupon: Coupon | null = null;
    if (request.couponCode) {
      coupon = await tx.coupon.findUnique({
        where: { code: request.couponCode }
      });
      if (!coupon) {
        throw new ApplicationError(
          ShopErrors.CouponInvalid,
          'Unknown coupon code',
          { couponCode: request.couponCode }
        );
      }

      const problem = couponProblem(coupon, priceOrder(lines).subtotal);
      if (problem) {
        throw new ApplicationError(ShopErrors.CouponInvalid, problem, {
          couponCode: request.couponCode
        });
      }

      await tx.coupon.update({
        where: { id: coupon.id },
        data: { redemptions: { increment: 1 } }
      });
    }

    const created = await tx.order.create({
      data: {
        number: orderNumber(),
        customerId: Number(customer.id),
        couponId: coupon?.id,
        shippingAddress,
        note: request.note,
        ...priceOrder(lines, coupon),
        items: { create: lines }
      }
    });

    // Both wait for the commit. The stock is written past the product service,
    // so its cached listings are dropped here, and the payment worker picks the
    // order up from the event, see the payments feature
    await inject(CacheService).invalidateCache('Product', 'update');
    inject(Events).emitResourceEvent<Order>('Order', 'create', {
      current: created as unknown as Order
    });

    // Read before the commit, so the response shows the order as placed rather
    // than racing the payment worker that charges it right after
    return injectService('Order').find(created.id);
  });
}

/** The quantity of every product, the same product listed twice added up. */
function mergeLines(items: CheckoutRequest['items']): Map<number, number> {
  const quantities = new Map<number, number>();
  for (const { product, quantity } of items) {
    quantities.set(product, (quantities.get(product) ?? 0) + quantity);
  }
  return quantities;
}

/** The address given with the order, or a saved one of the customer. */
async function resolveAddress(
  customer: AuthUser,
  request: CheckoutRequest
): Promise<ShippingAddress> {
  if (request.shippingAddress) {
    return request.shippingAddress;
  }

  const saved = request.addressId
    ? await db.address.findFirst({
        where: { id: request.addressId, userId: Number(customer.id) }
      })
    : null;
  if (!saved) {
    throw new RequestError(
      ErrorCode.ValidationFailed,
      'A shippingAddress or a saved addressId is required',
      {
        errors: [
          {
            field: 'shippingAddress',
            rule: 'required',
            message: 'is required without a saved addressId'
          }
        ]
      }
    );
  }

  const { recipient, street, city, postalCode, country } = saved;
  return { recipient, street, city, postalCode, country };
}

/** i.e. WS-20260927-4F7K2Q, readable on the phone and hard to guess. */
function orderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  return `WS-${date}-${suffix}`;
}
