import { randomBytes } from 'node:crypto';
import { AuthUser, Events } from '@appweaver/common';
import {
  CacheService,
  HttpError,
  inject,
  injectService
} from '@appweaver/core';
import db from '@db/client';
import { Coupon } from '@db/client/client';
import { Order, OrderResourceService, OrderSingle } from '@/types';
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
 * payment worker picks up from the resource event emitted here.
 */
export async function checkout(
  customer: AuthUser,
  request: CheckoutRequest
): Promise<OrderSingle> {
  const shippingAddress = await resolveAddress(customer, request);
  const quantities = mergeLines(request.items);

  const order = await db.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: { id: { in: [...quantities.keys()] }, status: 'Active' }
    });
    for (const productId of quantities.keys()) {
      if (!products.some((product) => product.id === productId)) {
        throw new HttpError(`Product ${productId} is not available`, 400);
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
        throw new HttpError(
          `Only ${product.stock} left of ${product.name}`,
          409
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
        throw new HttpError('Unknown coupon code', 400);
      }

      const problem = couponProblem(coupon, priceOrder(lines).subtotal);
      if (problem) {
        throw new HttpError(problem, 400);
      }

      await tx.coupon.update({
        where: { id: coupon.id },
        data: { redemptions: { increment: 1 } }
      });
    }

    return tx.order.create({
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
  });

  // Written past the product service, so its cached listings are dropped here
  await inject(CacheService).invalidateCache('Product', 'update');

  // Picked up by the payment worker, see the payments feature
  inject(Events).emitResourceEvent<Order>('Order', 'create', {
    current: order as unknown as Order
  });

  return injectService<OrderResourceService>('Order').find(order.id);
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
    throw new HttpError(
      'A shippingAddress or a saved addressId is required',
      400
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
