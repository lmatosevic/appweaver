import { Application, createApp, inject } from '@appweaver/core';
import { Database } from '@appweaver/common';
import { resetTestData } from './support/reset';
import {
  ADDRESS,
  createRoles,
  eventually,
  product,
  registerCustomer,
  request,
  RUN,
  warehouse
} from './support/fixtures';

/**
 * An order from the checkout to the doorstep, over HTTP: the stock and the
 * coupon it takes, the payment made in the background, the shipment reported
 * by the warehouse with its API key, and the cancellation giving it all back.
 */
describe('Order lifecycle', () => {
  let app: Application;
  let customer: Awaited<ReturnType<typeof registerCustomer>>;
  let other: Awaited<ReturnType<typeof registerCustomer>>;
  let partner: Record<string, string>;

  const db = () => inject<any>(Database).client();

  const checkout = (
    headers: Record<string, string>,
    items: { product: number; quantity: number }[],
    couponCode?: string
  ) =>
    request(app, 'POST', '/checkout', {
      headers,
      payload: { items, couponCode, shippingAddress: ADDRESS }
    });

  const statusOf = (orderId: string) =>
    eventually(
      async () =>
        (await db().order.findUnique({ where: { id: orderId } })).status,
      (status) => status !== 'Pending'
    );

  const stockOf = async (productId: number) =>
    (await db().product.findUnique({ where: { id: productId } })).stock;

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    await createRoles();

    customer = await registerCustomer(app, 'Cleo');
    other = await registerCustomer(app, 'Otto');
    partner = await warehouse();
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('prices the order, applying the coupon', async () => {
    const headphones = await product('HP', 12999, 5);
    await db().coupon.create({
      data: { code: `TEN${RUN}`.toUpperCase().slice(0, 20), value: 10 }
    });

    const { status, body } = await checkout(
      customer.auth,
      [{ product: headphones.id, quantity: 1 }],
      `TEN${RUN}`.toUpperCase().slice(0, 20)
    );

    expect(status).toBe(201);
    expect(body).toMatchObject({
      status: 'Pending',
      subtotal: 12999,
      discount: 1299,
      shippingCost: 0,
      total: 11700,
      customer: { id: customer.id }
    });
    expect(body.items).toHaveLength(1);
    expect(body.number).toMatch(/^WS-\d{8}-[0-9A-F]{6}$/);
  });

  test('reserves the stock and gets paid in the background', async () => {
    const cable = await product('CABLE', 1499, 10);

    const { body } = await checkout(customer.auth, [
      { product: cable.id, quantity: 3 }
    ]);

    expect(await stockOf(cable.id)).toBe(7);
    expect(await statusOf(body.id)).toBe('Paid');
  });

  test('never sells more than the stock', async () => {
    const lastOne = await product('LAST', 5000, 1);
    await checkout(customer.auth, [{ product: lastOne.id, quantity: 1 }]);

    const { status, body } = await checkout(other.auth, [
      { product: lastOne.id, quantity: 1 }
    ]);

    expect(status).toBe(409);
    expect(body.message).toMatch(/^Only 0 left of/);
  });

  test('refuses a product that is not for sale', async () => {
    const draft = await product('DRAFT', 5000, 10, 'Draft');

    const { status } = await checkout(customer.auth, [
      { product: draft.id, quantity: 1 }
    ]);

    expect(status).toBe(400);
  });

  test('fails a declined payment and gives the stock back', async () => {
    // Above the limit of the simulated payment provider
    const piano = await product('PIANO', 1_500_000, 2);

    const { body } = await checkout(customer.auth, [
      { product: piano.id, quantity: 1 }
    ]);

    expect(await statusOf(body.id)).toBe('PaymentFailed');
    expect(await stockOf(piano.id)).toBe(2);
  });

  test('lets the warehouse ship and deliver with its API key', async () => {
    const speaker = await product('SPK', 8000, 5);
    const { body: order } = await checkout(customer.auth, [
      { product: speaker.id, quantity: 1 }
    ]);
    await statusOf(order.id);

    const shipped = await request(app, 'POST', `/orders/${order.id}/ship`, {
      headers: partner,
      payload: { carrier: 'GLS', trackingNumber: 'GLS123456789' }
    });
    const delivered = await request(
      app,
      'POST',
      `/orders/${order.id}/deliver`,
      { headers: partner }
    );

    expect(shipped.body).toMatchObject({
      status: 'Shipped',
      carrier: 'GLS',
      trackingNumber: 'GLS123456789'
    });
    expect(delivered.body.status).toBe('Delivered');
  });

  test('keeps the fulfillment routes from customers', async () => {
    const stand = await product('STAND', 3000, 5);
    const { body: order } = await checkout(customer.auth, [
      { product: stand.id, quantity: 1 }
    ]);

    const { status } = await request(app, 'POST', `/orders/${order.id}/ship`, {
      headers: customer.auth,
      payload: { carrier: 'GLS', trackingNumber: 'GLS000' }
    });

    expect(status).toBe(403);
  });

  test('cancels an order before it ships, releasing the stock', async () => {
    const buds = await product('BUDS', 9000, 4);
    const { body: order } = await checkout(customer.auth, [
      { product: buds.id, quantity: 2 }
    ]);

    const { status, body } = await request(
      app,
      'POST',
      `/orders/${order.id}/cancel`,
      { headers: customer.auth }
    );

    expect(status).toBe(200);
    expect(body.status).toBe('Cancelled');
    expect(await stockOf(buds.id)).toBe(4);
  });

  test('shows customers their own orders only', async () => {
    const mug = await product('MUG', 1200, 5);
    const { body: order } = await checkout(other.auth, [
      { product: mug.id, quantity: 1 }
    ]);

    const own = await request(app, 'GET', `/orders/${order.id}`, {
      headers: other.auth
    });
    const foreign = await request(app, 'GET', `/orders/${order.id}`, {
      headers: customer.auth
    });
    const cancel = await request(app, 'POST', `/orders/${order.id}/cancel`, {
      headers: customer.auth
    });

    expect(own.status).toBe(200);
    expect(foreign.status).toBe(404);
    expect(cancel.status).toBe(404);
  });
});
