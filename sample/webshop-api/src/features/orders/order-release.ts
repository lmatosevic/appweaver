import { PrismaClient } from '@db/client/client';

type Transaction = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

/**
 * Gives back what an order held that never went out: the stock of its items
 * and the redemption of its coupon.
 */
export async function releaseOrder(
  tx: Transaction,
  order: { id: string; couponId: number | null }
): Promise<void> {
  const items = await tx.orderItem.findMany({
    where: { orderId: order.id, productId: { not: null } }
  });

  for (const item of items) {
    await tx.product.update({
      where: { id: item.productId! },
      data: { stock: { increment: item.quantity } }
    });
  }

  if (order.couponId) {
    await tx.coupon.update({
      where: { id: order.couponId },
      data: { redemptions: { decrement: 1 } }
    });
  }
}
