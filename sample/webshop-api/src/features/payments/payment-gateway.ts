import { SpanKind, telemetryCounter, withSpan } from '@appweaver/common';

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
  // A span of the application inside the one of the payment job, and a metric
  // of its own, both exported with the telemetry of the framework
  return withSpan(
    'payment charge',
    { kind: SpanKind.CLIENT, attributes: { 'order.id': order.id } },
    (span) => {
      const result: ChargeResult =
        order.total > DECLINE_ABOVE
          ? {
              approved: false,
              reason: 'Card declined: amount over the limit'
            }
          : { approved: true, transactionId: `txn_${order.id}` };

      span.setAttribute('payment.approved', result.approved);
      charges().add(1, { 'payment.approved': result.approved });
      return result;
    }
  );
}

const charges = telemetryCounter('webshop.payment.charges', {
  description: 'Number of charges sent to the payment provider.'
});
