import { EmailService, inject, registerTemplateHelper } from '@appweaver/core';
import { createLogger } from '@appweaver/common';
import db from '@db/client';

const logger = createLogger('orders');

type OrderEmail = 'confirmed' | 'paymentFailed' | 'shipped' | 'cancelled';

/** The templates of each email, `templates/emails/<name>.{html,txt,subject}.hbs`. */
const templates: Record<OrderEmail, string> = {
  confirmed: 'emails/order-confirmed',
  paymentFailed: 'emails/order-payment-failed',
  shipped: 'emails/order-shipped',
  cancelled: 'emails/order-cancelled'
};

type HelperOptions = { data?: { locale?: string } };

// The amounts are in cents, written in the format of the email's language,
// i.e. `{{money order.total}}` is "€1,234.50" in English and "1.234,50 €" in German
registerTemplateHelper('money', (cents: number, options: HelperOptions) =>
  new Intl.NumberFormat(options.data?.locale, {
    style: 'currency',
    currency: 'EUR'
  }).format(cents / 100)
);

// The country of an address is stored as its code, i.e. `{{countryName 'DE'}}`
// is "Germany" in English and "Deutschland" in German
registerTemplateHelper(
  'countryName',
  (code: string, options: HelperOptions) => {
    try {
      return new Intl.DisplayNames(options.data?.locale, { type: 'region' }).of(
        code
      );
    } catch {
      return code;
    }
  }
);

/**
 * Queues the email about the order in the language it was placed in, never
 * failing the caller.
 */
export async function sendOrderEmail(
  kind: OrderEmail,
  order: { id: string }
): Promise<void> {
  try {
    const details = await db.order.findUniqueOrThrow({
      where: { id: order.id },
      include: {
        customer: { select: { firstName: true, email: true } },
        items: { orderBy: { id: 'asc' } },
        coupon: { select: { code: true } }
      }
    });

    await inject(EmailService).sendEmail({
      to: details.customer.email,
      template: templates[kind],
      data: { order: details, customer: details.customer },
      locale: details.language
    });
  } catch (e) {
    logger.warn(e, `Order email "${kind}" was not sent`);
  }
}
