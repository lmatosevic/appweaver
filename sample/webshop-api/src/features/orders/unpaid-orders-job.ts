import { inject } from '@appweaver/core';
import { logger, Scheduler } from '@appweaver/common';
import db from '@db/client';
import { cancelOrder } from './order-status';

/** A pending order still unpaid after this long is cancelled. */
export const UNPAID_ORDER_TTL_MINUTES = 30;

// Every five minutes, so reserved stock does not stay locked by an abandoned
// payment
inject(Scheduler).addJob({
  cronTime: '*/5 * * * *',
  onTick: async () => {
    const cancelled = await cancelUnpaidOrders();
    if (cancelled > 0) {
      logger.info(`Unpaid orders cancelled: ${cancelled}`);
    }
  }
});

/** Cancels the orders left pending past their time, releasing their stock. */
export async function cancelUnpaidOrders(
  now: Date = new Date()
): Promise<number> {
  const expired = await db.order.findMany({
    where: {
      status: 'Pending',
      createdAt: {
        lt: new Date(now.getTime() - UNPAID_ORDER_TTL_MINUTES * 60_000)
      }
    },
    select: { id: true }
  });

  for (const order of expired) {
    // Without a user, as the system cancels it
    await cancelOrder(order.id, null);
  }

  return expired.length;
}
