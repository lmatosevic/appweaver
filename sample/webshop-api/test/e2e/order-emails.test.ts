import { Email } from '@appweaver/common';
import { Application, createApp, EmailService, inject } from '@appweaver/core';
import { resetTestData } from './support/reset';
import {
  ADDRESS,
  createRoles,
  eventually,
  product,
  registerCustomer,
  request,
  warehouse
} from './support/fixtures';

/**
 * The order emails, rendered from the `templates/emails/order-*` templates in
 * the language of the order: the preferred one of the customer, unless the
 * checkout asks for another.
 */
describe('Order emails', () => {
  let app: Application;
  let croatian: Awaited<ReturnType<typeof registerCustomer>>;
  let english: Awaited<ReturnType<typeof registerCustomer>>;
  let partner: Record<string, string>;
  let renderEmail: jest.SpyInstance;

  const checkout = (
    headers: Record<string, string>,
    items: { product: number; quantity: number }[],
    language?: string
  ) =>
    request(app, 'POST', '/checkout', {
      headers,
      payload: { items, shippingAddress: ADDRESS, language }
    });

  /** Waits for the email sent about the order, as the payment runs in the background. */
  const emailAbout = (orderNumber: string, subject: RegExp) =>
    eventually(
      async () =>
        (
          (await Promise.all(
            renderEmail.mock.results.map((result) => result.value)
          )) as Email[]
        ).find(
          (email) =>
            email.subject.includes(orderNumber) && subject.test(email.subject)
        ),
      (email) => email !== undefined
    ) as Promise<Email>;

  beforeAll(async () => {
    app = await createApp();
    await createRoles();

    croatian = await registerCustomer(app, 'Ivana', 'hr');
    english = await registerCustomer(app, 'Emma');
    partner = await warehouse();
    renderEmail = jest.spyOn(inject(EmailService), 'renderTemplateEmail');
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('confirms the payment in the preferred language of the customer', async () => {
    const headphones = await product('MAILHP', 12999, 5);
    const cable = await product('MAILCBL', 1499, 5);

    const { body: order } = await checkout(croatian.auth, [
      { product: headphones.id, quantity: 1 },
      { product: cable.id, quantity: 2 }
    ]);
    const email = await emailAbout(order.number, /potvrđena/);

    expect(order.language).toBe('hr');
    expect(email.to).toBe(croatian.email);
    expect(email.subject).toBe(`Narudžba ${order.number} je potvrđena`);
    expect(email.html).toContain('<html lang="hr">');
    expect(email.html).toContain('Pozdrav Ivana,');
    expect(email.html).toContain(
      `Narudžba ${order.number} sadrži 2 proizvoda:`
    );
    expect(email.html).toContain('Ukupno');
    expect(email.html).toContain('159,97\u00a0€');
    // The text body of its own template, with the text partial of the summary
    expect(email.text).toContain(
      `2 x Product ${cable.sku} (${cable.sku}): 29,98\u00a0€`
    );
    expect(email.text).toContain('Ukupno: 159,97\u00a0€');
    expect(email.text).toContain('Hrvatska');
    expect(email.text).toContain(
      'Ovu poruku poslala je aplikacija Webshop API.'
    );
  });

  test('writes the emails in the language asked for at checkout', async () => {
    const speaker = await product('MAILSPK', 8000, 5);

    const { body: order } = await checkout(
      english.auth,
      [{ product: speaker.id, quantity: 1 }],
      'de'
    );
    const email = await emailAbout(order.number, /bestätigt/);

    expect(order.language).toBe('de');
    expect(email.subject).toBe(`Bestellung ${order.number} bestätigt`);
    expect(email.html).toContain('Gesamt');
    expect(email.html).toContain('80,00\u00a0€');
    expect(email.html).toContain('Kroatien');
    expect(email.html).toContain(
      'Diese E-Mail wurde von Webshop API gesendet.'
    );
  });

  test('writes the emails in English by default', async () => {
    const stand = await product('MAILSTD', 3000, 5);

    const { body: order } = await checkout(english.auth, [
      { product: stand.id, quantity: 1 }
    ]);
    const email = await emailAbout(order.number, /confirmed/);

    expect(order.language).toBe('en');
    expect(email.subject).toBe(`Order ${order.number} confirmed`);
    expect(email.text).toContain(`Order ${order.number} contains 1 product:`);
    expect(email.text).toContain('Shipping: €4.99');
    expect(email.text).toContain('Total: €34.99');
    expect(email.text).toContain('Croatia');
  });

  test('derives the text of an email without a text template from its HTML', async () => {
    const amp = await product('MAILAMP', 20000, 5);
    const { body: order } = await checkout(croatian.auth, [
      { product: amp.id, quantity: 1 }
    ]);
    await emailAbout(order.number, /potvrđena/);

    await request(app, 'POST', `/orders/${order.id}/ship`, {
      headers: partner,
      payload: { carrier: 'GLS', trackingNumber: 'GLS987654321' }
    });
    const email = await emailAbout(order.number, /na putu/);

    expect(email.subject).toBe(`Narudžba ${order.number} je na putu`);
    expect(email.text).toContain(
      'Vaša narudžba predana je dostavljaču GLS, broj za praćenje je:\n\nGLS987654321'
    );
  });
});
