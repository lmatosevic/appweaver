import { Application, createApp } from '@appweaver/core';
import { Role } from '@/features/access/roles';
import { resetTestData } from './support/reset';
import {
  ADDRESS,
  createRoles,
  eventually,
  PASSWORD,
  product,
  registerCustomer,
  request,
  RUN,
  staff
} from './support/fixtures';

/**
 * The storefront over HTTP: the catalog without an account, the registration,
 * the reviews marked as verified purchases, and the admin sales report.
 */
describe('Storefront', () => {
  let app: Application;
  let admin: Record<string, string>;

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    await createRoles();
    admin = await staff(app, 'Ada', Role.Admin);
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('keeps a draft out of the storefront until an admin publishes it', async () => {
    const draft = await product('SECRET', 1000, 1, 'Draft');

    const hidden = await request(app, 'GET', `/products/${draft.id}`);
    const published = await request(app, 'PUT', `/products/${draft.id}`, {
      headers: admin,
      payload: { status: 'Active' }
    });
    const listed = await request(app, 'GET', `/products/${draft.id}`);

    expect(hidden.status).toBe(404);
    expect(published.body.status).toBe('Active');
    expect(listed.status).toBe(200);
  });

  test('searches the catalog, ignoring the case', async () => {
    const listed = await product('FINDME', 1000, 1);

    const { body } = await request(app, 'POST', '/products/query', {
      payload: { filter: { searchText: `product findme-${RUN}` } }
    });

    expect(body.items.map((item: any) => item.id)).toEqual([listed.id]);
  });

  test('computes the stock and sale flags', async () => {
    const sold = await product('SOLDOUT', 1000, 0);

    const { body } = await request(app, 'GET', `/products/${sold.id}`);

    expect(body).toMatchObject({ inStock: false, discountPercent: null });
  });

  test('registers a customer once per email', async () => {
    const email = `twice.${RUN}@test.example.com`;
    const register = () =>
      request(app, 'POST', '/register', {
        payload: { firstName: 'Tw', lastName: 'Ice', email, password: PASSWORD }
      });

    const first = await register();
    const second = await register();

    expect(first.status).toBe(201);
    expect(first.body.roles.map((role: any) => role.name)).toEqual([
      Role.Customer
    ]);
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({
      code: 'DATABASE_UNIQUE_VIOLATION',
      errors: [{ field: 'email', rule: 'unique' }]
    });
  });

  test('marks the review of a bought product as verified', async () => {
    const buyer = await registerCustomer(app, 'Bea');
    const browser = await registerCustomer(app, 'Bo');
    const lamp = await product('LAMP', 4000, 5);

    const { body: order } = await request(app, 'POST', '/checkout', {
      headers: buyer.auth,
      payload: {
        items: [{ product: lamp.id, quantity: 1 }],
        shippingAddress: ADDRESS
      }
    });
    await eventually(
      async () =>
        (
          await request(app, 'GET', `/orders/${order.id}`, {
            headers: buyer.auth
          })
        ).body.status,
      (status) => status === 'Paid'
    );

    const review = (auth: Record<string, string>) =>
      request(app, 'POST', '/reviews', {
        headers: auth,
        payload: { product: lamp.id, rating: 5, title: 'Bright' }
      });
    const bought = await review(buyer.auth);
    const browsed = await review(browser.auth);

    expect(bought.body).toMatchObject({
      verifiedPurchase: true,
      authorName: 'Bea T.'
    });
    expect(browsed.body.verifiedPurchase).toBe(false);
    expect(JSON.stringify(bought.body)).not.toContain('@test.example.com');
  });

  test('reports the sales to admins only', async () => {
    const select = { select: { total: { sum: true, count: true } } };
    const customer = await registerCustomer(app, 'Sal');

    const denied = await request(app, 'POST', '/orders/aggregate', {
      headers: customer.auth,
      payload: select
    });
    const report = await request(app, 'POST', '/orders/aggregate', {
      headers: admin,
      payload: select
    });

    expect(denied.status).toBe(403);
    expect(report.body.total.total.count).toBeGreaterThanOrEqual(1);
  });
});
