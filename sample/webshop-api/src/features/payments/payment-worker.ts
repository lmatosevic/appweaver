import { CacheService, inject } from '@appweaver/core';
import { Events, logger, Queue } from '@appweaver/common';
import db from '@db/client';
import { Order } from '@/types';
import { sendOrderEmail } from '@/features/orders/order-emails';
import { releaseOrder } from '@/features/orders/order-release';
import { charge } from './payment-gateway';

type PaymentJob = { orderId: string };

// BullMQ on Redis in development and production, in memory for the tests
const payments = inject(Queue).get<PaymentJob, void>('payments');

payments.addWorker(async (job) => {
  await processPayment(job.data.orderId);
});

payments.onFailed((job, err) => {
  logger.error(err, `Payment of order ${job?.data.orderId} failed`);
});

// A placed order is charged in the background, the checkout never waits for
// the payment provider
inject(Events).onResourceEvent<Order>(
  'Order',
  'create',
  async ({ current }) => {
    await payments.sendJob({ orderId: current.id }, 'charge');
  }
);

/**
 * Charges a pending order: an approved payment marks it paid, a declined one
 * fails it and gives its stock and coupon back.
 */
export async function processPayment(orderId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: { customer: true }
  });
  // Cancelled or charged in the meantime
  if (order?.status !== 'Pending') {
    return;
  }

  const result = await charge(order);

  // Moved on only while still pending, as the customer may cancel the order
  // while it is being charged, which already gave its stock back
  if (result.approved) {
    const paid = await db.order.updateMany({
      where: { id: orderId, status: 'Pending' },
      data: { status: 'Paid', paidAt: new Date() }
    });
    if (paid.count === 0) {
      return;
    }
    await inject(CacheService).invalidateCache('Order', 'update');
    await sendOrderEmail('confirmed', order);
  } else {
    const failed = await db.$transaction(async (tx) => {
      const moved = await tx.order.updateMany({
        where: { id: orderId, status: 'Pending' },
        data: { status: 'PaymentFailed', note: result.reason }
      });
      if (moved.count > 0) {
        await releaseOrder(tx, order);
      }
      return moved.count > 0;
    });
    if (!failed) {
      return;
    }
    await inject(CacheService).invalidateCache('Order', 'update');
    await sendOrderEmail('paymentFailed', order);
  }
}
