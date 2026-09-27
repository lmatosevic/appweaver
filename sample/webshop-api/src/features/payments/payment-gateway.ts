/** Orders above this total are declined by the simulated provider (cents). */
export const DECLINE_ABOVE = 1_000_000;

export type ChargeResult =
  | { approved: true; transactionId: string }
  | { approved: false; reason: string };

/**
 * A stand-in for a payment provider such as Stripe or Adyen: it approves
 * every charge up to a limit, so both outcomes can be tried locally.
 */
export async function charge(order: {
  id: string;
  total: number;
}): Promise<ChargeResult> {
  if (order.total > DECLINE_ABOVE) {
    return { approved: false, reason: 'Card declined: amount over the limit' };
  }

  return { approved: true, transactionId: `txn_${order.id}` };
}
