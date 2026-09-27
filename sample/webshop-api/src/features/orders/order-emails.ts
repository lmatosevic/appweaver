import { EmailService, inject } from '@appweaver/core';
import { logger } from '@appweaver/common';

type OrderMail = {
  number: string;
  total: number;
  customer: { email: string; firstName: string };
  carrier?: string | null;
  trackingNumber?: string | null;
};

const euros = (cents: number) => `${(cents / 100).toFixed(2)} EUR`;

const messages: Record<
  'confirmed' | 'paymentFailed' | 'shipped' | 'cancelled',
  (order: OrderMail) => { subject: string; text: string }
> = {
  confirmed: (order) => ({
    subject: `Order ${order.number} confirmed`,
    text: `we received the payment of ${euros(order.total)}, your order is being packed.`
  }),
  paymentFailed: (order) => ({
    subject: `Payment for order ${order.number} failed`,
    text: 'the payment was declined, so the order was not placed. Please try again with another card.'
  }),
  shipped: (order) => ({
    subject: `Order ${order.number} is on its way`,
    text: `your order was handed to ${order.carrier}, the tracking number is ${order.trackingNumber}.`
  }),
  cancelled: (order) => ({
    subject: `Order ${order.number} cancelled`,
    text: 'your order was cancelled. A payment already made is refunded within a few days.'
  })
};

/** Queues the email about the order, never failing the caller. */
export async function sendOrderEmail(
  kind: keyof typeof messages,
  order: OrderMail
): Promise<void> {
  const { subject, text } = messages[kind](order);

  try {
    await inject(EmailService).sendEmail({
      to: order.customer.email,
      subject,
      text: `Hi ${order.customer.firstName},\n\n${text}`
    });
  } catch (e) {
    logger.warn(e, `Order email "${kind}" was not sent`);
  }
}
