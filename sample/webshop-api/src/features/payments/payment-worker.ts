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

  if (result.approved) {
    await db.order.update({
      where: { id: orderId },
      data: { status: 'Paid', paidAt: new Date() }
    });
    await sendOrderEmail('confirmed', order);
  } else {
    await db.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: 'PaymentFailed', note: result.reason }
      });
      await releaseOrder(tx, order);
    });
    await sendOrderEmail('paymentFailed', order);
  }

  await inject(CacheService).invalidateCache('Order', 'update');
}
