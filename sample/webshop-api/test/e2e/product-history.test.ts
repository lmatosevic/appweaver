import { Application, createApp, inject } from '@appweaver/core';
import { Database } from '@appweaver/common';
import { Role } from '@/features/access/roles';
import { resetTestData } from './support/reset';
import {
  ADDRESS,
  createRoles,
  eventually,
  product,
  registerCustomer,
  request,
  staff
} from './support/fixtures';

/**
 * The price and stock history of the products in a TimescaleDB hypertable:
 * the points queued by the price changes and the checkouts, the lowest price
 * the storefront shows beside a discount, and the sales analytics of the
 * admins.
 */
describe('Product history', () => {
  let app: Application;
  let admin: Record<string, string>;
  let customer: Awaited<ReturnType<typeof registerCustomer>>;

  const db = () => inject<any>(Database).client();

  const series = (productId: number, query = '') =>
    request(app, 'GET', `/products/${productId}/series${query}`, {
      headers: admin
    });

  /** Waits for the queue worker to write the points. */
  const pointsOf = (productId: number, query: string, count: number) =>
    eventually(
      async () => (await series(productId, query)).body.items,
      (items) => items?.length === count
    );

  beforeAll(async () => {
    app = await createApp();
    await createRoles();

    admin = await staff(app, 'Hana', Role.Admin);
    customer = await registerCustomer(app, 'Petra');
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('keeps the points in a TimescaleDB hypertable', async () => {
    const tables = await db().$queryRawUnsafe(
      `SELECT hypertable_name, compression_enabled FROM timescaledb_information.hypertables`
    );

    expect(tables).toEqual([
      { hypertable_name: 'ProductSeries', compression_enabled: true }
    ]);
  });

  test('records the prices an admin sets, written by the queue worker', async () => {
    const speaker = await product('SPK', 9999, 10);

    for (const price of [8999, 10999]) {
      const updated = await request(app, 'PATCH', `/products/${speaker.id}`, {
        headers: admin,
        payload: { price }
      });
      expect(updated.status).toBe(200);
    }

    const prices = await pointsOf(speaker.id, '?fields=price', 2);
    expect(prices.map((point: any) => point.price)).toEqual([8999, 10999]);
  });

  test('shows the lowest price of the last 30 days to the storefront', async () => {
    const lamp = await product('LMP', 4999, 3);
    await request(app, 'PATCH', `/products/${lamp.id}`, {
      headers: admin,
      payload: { price: 3999 }
    });
    await pointsOf(lamp.id, '?fields=price', 1);
    await request(app, 'PATCH', `/products/${lamp.id}`, {
      headers: admin,
      payload: { price: 5999 }
    });
    await pointsOf(lamp.id, '?fields=price', 2);

    const { status, body } = await request(
      app,
      'GET',
      `/products/${lamp.id}/lowest-price`
    );

    expect(status).toBe(200);
    expect(body).toEqual({
      productId: lamp.id,
      price: 5999,
      lowestPrice: 3999,
      days: 30
    });
  });

  test('records the stock and the units sold of a checkout, and nothing of a failed one', async () => {
    const mug = await product('MUG', 1500, 5);

    const placed = await request(app, 'POST', '/checkout', {
      headers: customer.auth,
      payload: {
        items: [{ product: mug.id, quantity: 2 }],
        shippingAddress: ADDRESS
      }
    });
    const failed = await request(app, 'POST', '/checkout', {
      headers: customer.auth,
      payload: {
        items: [{ product: mug.id, quantity: 9 }],
        shippingAddress: ADDRESS
      }
    });

    expect(placed.status).toBe(201);
    expect(failed.status).toBe(409);
    const points = await pointsOf(mug.id, '?fields=stock,sold', 1);
    expect(points).toEqual([{ time: expect.any(String), stock: 3, sold: 2 }]);
  });

  test('aggregates the daily sales of many products', async () => {
    const pen = await product('PEN', 300, 50);
    const ink = await product('INK', 900, 50);

    // Imported directly, the history of another shop
    const imported = await request(
      app,
      'POST',
      '/products/series?ingest=direct',
      {
        headers: admin,
        payload: {
          points: [
            { resourceId: pen.id, time: '2026-03-01T09:00:00Z', sold: 4 },
            { resourceId: pen.id, time: '2026-03-01T17:30:00Z', sold: 6 },
            { resourceId: pen.id, time: '2026-03-02T10:00:00Z', sold: 1 },
            { resourceId: ink.id, time: '2026-03-01T12:00:00Z', sold: 3 }
          ]
        }
      }
    );
    expect(imported).toEqual({
      status: 200,
      body: { count: 4, queued: false }
    });

    const { status, body } = await request(
      app,
      'POST',
      '/products/series/query',
      {
        headers: admin,
        payload: {
          ids: [pen.id, ink.id],
          fields: ['sold'],
          from: '2026-03-01T00:00:00Z',
          to: '2026-03-03T00:00:00Z',
          bucket: '1d',
          aggregate: 'sum'
        }
      }
    );

    expect(status).toBe(200);
    expect(body.items).toEqual([
      { resourceId: pen.id, time: '2026-03-01T00:00:00.000Z', sold: 10 },
      { resourceId: ink.id, time: '2026-03-01T00:00:00.000Z', sold: 3 },
      { resourceId: pen.id, time: '2026-03-02T00:00:00.000Z', sold: 1 }
    ]);
  });

  test('keeps the analytics to the admins', async () => {
    const cable = await product('CBL', 1200, 4);

    const asCustomer = await request(
      app,
      'GET',
      `/products/${cable.id}/series`,
      {
        headers: customer.auth
      }
    );
    const anonymous = await request(app, 'GET', `/products/${cable.id}/series`);

    expect(asCustomer.status).toBe(403);
    expect(anonymous.status).toBe(401);
  });

  test('deletes a range of points, and every point with the product', async () => {
    const desk = await product('DSK', 25000, 2);
    await request(app, 'POST', `/products/${desk.id}/series?ingest=direct`, {
      headers: admin,
      payload: {
        points: [
          { time: '2026-02-01T00:00:00Z', price: 26000 },
          { time: '2026-02-10T00:00:00Z', price: 24000 },
          { time: '2026-02-20T00:00:00Z', price: 25000 }
        ]
      }
    });

    const range = await request(
      app,
      'POST',
      `/products/${desk.id}/delete-series`,
      {
        headers: admin,
        payload: { from: '2026-02-05T00:00:00Z', to: '2026-02-15T00:00:00Z' }
      }
    );
    expect(range.body).toEqual({ count: 1 });

    const deleted = await request(app, 'DELETE', `/products/${desk.id}`, {
      headers: admin
    });
    expect(deleted.status).toBe(200);
    await expect(
      db().productSeries.count({ where: { resourceId: desk.id } })
    ).resolves.toBe(0);
  });
});
