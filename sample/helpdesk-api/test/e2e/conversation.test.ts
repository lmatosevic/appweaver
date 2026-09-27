import { Application, createApp } from '@appweaver/core';
import { resetTestData } from './support/reset';
import {
  agent,
  createRoles,
  integration,
  request,
  RUN
} from './support/fixtures';

/**
 * A ticket opened by an integration and answered by an agent, over HTTP: the
 * tags created on the fly, the tickets and notes an integration may see, the
 * status each reply moves the ticket to, and the thread read with a cursor.
 */
describe('Ticket conversation', () => {
  let app: Application;
  let staff: Awaited<ReturnType<typeof agent>>;
  let statusPage: Record<string, string>;
  let otherIntegration: Record<string, string>;
  let ticket: any;

  const reply = (
    headers: Record<string, string>,
    body: string,
    internal = false
  ) =>
    request(app, 'POST', '/messages', {
      headers,
      payload: { ticket: ticket.id, body, internal }
    });

  const statusOf = async () =>
    (
      await request(app, 'GET', `/tickets/${ticket.id}`, {
        headers: staff.auth
      })
    ).body;

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    await createRoles();

    staff = await agent(app, `Agent${RUN}`);
    statusPage = await integration(`StatusPage${RUN}`);
    otherIntegration = await integration(`Other${RUN}`);

    const created = await request(app, 'POST', '/tickets', {
      headers: statusPage,
      payload: {
        subject: 'API latency above target',
        description: 'p95 latency is above 2 seconds.',
        priority: 'High',
        customer: { email: `ops.${RUN}@example.com`, name: 'Ops' },
        tags: [
          { name: 'Outage', slug: `outage-${RUN}` },
          { name: 'Latency', slug: `latency-${RUN}` }
        ]
      }
    });
    ticket = created.body;
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('creates the ticket with its tags through the API key', () => {
    expect(ticket).toMatchObject({ channel: 'Api', priority: 'High' });
    expect(ticket.tags.map((tag: any) => tag.name).sort()).toEqual([
      'Latency',
      'Outage'
    ]);
  });

  test('shows an integration the tickets it opened only', async () => {
    const own = await request(app, 'GET', `/tickets/${ticket.id}`, {
      headers: statusPage
    });
    const foreign = await request(app, 'GET', `/tickets/${ticket.id}`, {
      headers: otherIntegration
    });

    expect(own.status).toBe(200);
    expect(foreign.status).toBe(404);
  });

  test('waits on the customer after an agent replies', async () => {
    const { body } = await reply(staff.auth, 'We are looking into it.');

    expect(body).toMatchObject({ fromCustomer: false });
    expect(body.author.id).toBe(staff.id);
    expect(await statusOf()).toMatchObject({ status: 'Pending' });
    expect((await statusOf()).firstRespondedAt).toBeDefined();
  });

  test('keeps the internal notes from the integration', async () => {
    await reply(staff.auth, 'The cache cluster is degraded.', true);

    const { body } = await request(app, 'POST', '/messages/query', {
      headers: statusPage,
      payload: { filter: { ticket: ticket.id } }
    });

    expect(body.items.some((message: any) => message.internal)).toBe(false);
    expect(body.items.length).toBeGreaterThan(0);
  });

  test('relays the customer through the integration, reopening the ticket', async () => {
    // Asking for an internal note does not let an integration write one
    const { body } = await reply(statusPage, 'Still slow here.', true);

    expect(body).toMatchObject({ fromCustomer: true, internal: false });
    expect((await statusOf()).status).toBe('Open');
  });

  test('reads a long thread page by page', async () => {
    for (const index of [1, 2, 3]) {
      await reply(staff.auth, `Update ${index}`, true);
    }

    const bodies: string[] = [];
    let cursor: string | undefined;
    do {
      const { body } = await request(app, 'POST', '/messages/query', {
        headers: staff.auth,
        payload: {
          filter: { ticket: ticket.id },
          sort: 'createdAt',
          size: 2,
          cursor,
          totalCount: false
        }
      });
      bodies.push(...body.items.map((message: any) => message.body));
      cursor = body.nextCursor;
    } while (cursor);

    expect(bodies[0]).toBe('p95 latency is above 2 seconds.');
    expect(bodies.slice(-3)).toEqual(['Update 1', 'Update 2', 'Update 3']);
    expect(new Set(bodies).size).toBe(bodies.length);
  });

  test('dates the resolution', async () => {
    const { body } = await request(app, 'PUT', `/tickets/${ticket.id}`, {
      headers: staff.auth,
      payload: { status: 'Resolved' }
    });

    expect(body.status).toBe('Resolved');
    expect(body.resolvedAt).toBeDefined();
  });
});
