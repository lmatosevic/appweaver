import { AuthUser } from '@appweaver/common';
import {
  CacheService,
  hasRole,
  HttpError,
  inject,
  injectService
} from '@appweaver/core';
import db from '@db/client';
import { OrderSingle } from '@/types';
import { Role } from '@/features/access/roles';
import { sendOrderEmail } from './order-emails';
import { releaseOrder } from './order-release';

type OrderStatus = OrderSingle['status'];

/**
 * Moves an order from one of the expected states to the next one, failing
 * with a conflict when it has moved on in the meantime.
 */
async function transition(
  orderId: string,
  from: OrderStatus[],
  data: { status: OrderStatus } & Record<string, unknown>
): Promise<void> {
  const moved = await db.order.updateMany({
    where: { id: orderId, status: { in: from } },
    data
  });

  if (moved.count === 0) {
    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new HttpError('Order not found', 404);
    }
    throw new HttpError(
      `A ${order.status} order cannot be ${data.status}`,
      409
    );
  }

  await inject(CacheService).invalidateCache('Order', 'update');
}

const findOrder = (orderId: string) => injectService('Order').find(orderId);

/** Hands a paid order to the carrier. */
export async function shipOrder(
  orderId: string,
  shipment: { carrier: string; trackingNumber: string }
): Promise<OrderSingle> {
  await transition(orderId, ['Paid'], {
    status: 'Shipped',
    shippedAt: new Date(),
    ...shipment
  });

  const order = await findOrder(orderId);
  await sendOrderEmail('shipped', order);
  return order;
}

/** Confirms the carrier delivered a shipped order. */
export async function deliverOrder(orderId: string): Promise<OrderSingle> {
  await transition(orderId, ['Shipped'], {
    status: 'Delivered',
    deliveredAt: new Date()
  });

  return findOrder(orderId);
}

/**
 * Cancels an order that has not shipped yet, giving its stock and coupon
 * back. Customers cancel their own orders, admins any of them.
 */
export async function cancelOrder(
  orderId: string,
  user: AuthUser | null
): Promise<OrderSingle> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { customer: true }
  });
  const isOwner = order && user && order.customerId === Number(user.id);
  if (!order || (user && !isOwner && !hasRole(user, Role.Admin))) {
    throw new HttpError('Order not found', 404);
  }

  await db.$transaction(async (tx) => {
    const cancelled = await tx.order.updateMany({
      where: { id: orderId, status: { in: ['Pending', 'Paid'] } },
      data: { status: 'Cancelled', cancelledAt: new Date() }
    });
    if (cancelled.count === 0) {
      throw new HttpError(`A ${order.status} order cannot be Cancelled`, 409);
    }

    await releaseOrder(tx, order);
  });

  await inject(CacheService).invalidateCache('Order', 'update');
  await inject(CacheService).invalidateCache('Product', 'update');
  await sendOrderEmail('cancelled', order);

  return findOrder(orderId);
}
