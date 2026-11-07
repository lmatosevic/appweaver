import { TimeSeries } from '@appweaver/common';
import { Application, createApp, inject } from '@appweaver/core';
import { DatabaseTimeSeries } from '@appweaver/data';
import { Role } from '@/features/access/roles';
import { resetTestData } from './support/reset';
import {
  agent,
  createRoles,
  db,
  integration,
  request,
  RUN,
  team
} from './support/fixtures';

const MINUTE = 60_000;

/**
 * The workload metrics of the teams in their series table: the points the
 * metrics job writes every 15 minutes, read by the staff dashboards,
 * aggregated by bucket and across the teams of a filter, and deleted after
 * their retention or with their team.
 */
describe('Team metrics', () => {
  let app: Application;
  let billing: { id: number };
  let shipping: { id: number };
  let lead: Awaited<ReturnType<typeof agent>>;
  let partner: Record<string, string>;
  // Imported once the application defines the scheduler the job registers on
  let recordTeamMetrics: (now?: Date) => Promise<number>;

  // A point in the past, so the points of each run stay in their own range
  const start = new Date(
    Math.floor(Date.now() / (60 * MINUTE)) * 60 * MINUTE - 24 * 60 * MINUTE
  );
  const at = (minutes: number) => new Date(start.getTime() + minutes * MINUTE);

  const series = (teamId: number, query: string) =>
    request(app, 'GET', `/teams/${teamId}/series${query}`, {
      headers: lead.auth
    });

  const pointsOf = async (teamId: number, query: string, count: number) => {
    const { items } = (await series(teamId, query)).body;
    expect(items).toHaveLength(count);
    return items;
  };

  let tickets = 0;
  const ticket = async (data: Record<string, unknown>) => {
    const customer = await db().customer.create({
      data: {
        email: `c${++tickets}.${RUN}@customer.example.com`,
        name: 'Customer'
      }
    });
    return db().ticket.create({
      data: {
        reference: `HD-M${tickets}${RUN}`.slice(0, 20),
        subject: 'Metrics ticket',
        customerId: customer.id,
        ...data
      }
    });
  };

  beforeAll(async () => {
    app = await createApp();
    await createRoles();
    ({ recordTeamMetrics } =
      await import('@/features/metrics/team-metrics-job'));

    billing = await team('Billing');
    shipping = await team('Shipping');
    lead = await agent(app, `Lead${RUN}`, { teamId: billing.id });
    partner = await integration(`Status${RUN}`);

    // Billing: an assigned ticket answered 30 minutes after it was opened, an
    // unassigned one, an overdue one, and a resolved one
    await ticket({
      teamId: billing.id,
      status: 'Open',
      assigneeId: lead.id,
      createdAt: at(-40),
      firstRespondedAt: at(-10)
    });
    await ticket({ teamId: billing.id, status: 'New' });
    await ticket({
      teamId: billing.id,
      status: 'Open',
      assigneeId: lead.id,
      resolutionDueAt: at(-60)
    });
    await ticket({ teamId: billing.id, status: 'Resolved' });
    await ticket({ teamId: shipping.id, status: 'New' });
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('records the workload of every team', async () => {
    await expect(recordTeamMetrics(at(0))).resolves.toBe(2);

    const [point] = await pointsOf(
      billing.id,
      `?from=${at(0).toISOString()}`,
      1
    );

    expect(point).toEqual({
      time: at(0).toISOString(),
      open: 3,
      unassigned: 1,
      overdue: 1,
      firstResponseMinutes: 30,
      breached: true
    });
  });

  test('aggregates the points of an hour, the breaches as their share', async () => {
    // Fifteen minutes later the overdue ticket is resolved
    await db().ticket.updateMany({
      where: { teamId: billing.id, resolutionDueAt: { not: null } },
      data: { status: 'Resolved' }
    });
    await recordTeamMetrics(at(15));
    await pointsOf(billing.id, `?from=${at(0).toISOString()}`, 2);

    const max = await series(
      billing.id,
      `?from=${at(0).toISOString()}&bucket=1h&aggregate=max&fields=open,overdue`
    );
    const breaches = await series(
      billing.id,
      `?from=${at(0).toISOString()}&bucket=1h&fields=breached`
    );
    const last = await series(
      billing.id,
      `?from=${at(0).toISOString()}&aggregate=last&fields=open,firstResponseMinutes`
    );

    expect(max.body.items).toEqual([
      { time: at(0).toISOString(), open: 3, overdue: 1 }
    ]);
    expect(breaches.body.items).toEqual([
      { time: at(0).toISOString(), breached: 0.5 }
    ]);
    // The second point has no answered ticket, so the last response time is the first one's
    expect(last.body.items).toEqual([
      { time: at(0).toISOString(), open: 2, firstResponseMinutes: 30 }
    ]);
  });

  test('compares the teams of a filter', async () => {
    const { status, body } = await request(app, 'POST', '/teams/series/query', {
      headers: lead.auth,
      payload: {
        filter: { slug: { _ends: RUN.toLowerCase() } },
        fields: ['open', 'unassigned'],
        from: at(0).toISOString(),
        to: at(1).toISOString()
      }
    });

    expect(status).toBe(200);
    expect(body.items).toEqual([
      {
        resourceId: billing.id,
        time: at(0).toISOString(),
        open: 3,
        unassigned: 1
      },
      {
        resourceId: shipping.id,
        time: at(0).toISOString(),
        open: 1,
        unassigned: 1
      }
    ]);
  });

  test('keeps the metrics to the staff, written by the job only', async () => {
    const asIntegration = await request(
      app,
      'GET',
      `/teams/${billing.id}/series`,
      {
        headers: partner
      }
    );
    const write = await request(app, 'POST', `/teams/${billing.id}/series`, {
      headers: lead.auth,
      payload: { points: [{ open: 1 }] }
    });
    const remove = await request(
      app,
      'POST',
      `/teams/${billing.id}/delete-series`,
      {
        headers: lead.auth,
        payload: {}
      }
    );

    expect(asIntegration.status).toBe(403);
    expect(write.status).toBe(404);
    expect(remove.status).toBe(403);
  });

  test('lets an admin clear a range of points', async () => {
    const admin = await agent(app, `Admin${RUN}`, { role: Role.Admin });

    const { status, body } = await request(
      app,
      'POST',
      `/teams/${shipping.id}/delete-series`,
      {
        headers: admin.auth,
        payload: { from: at(0).toISOString(), to: at(1).toISOString() }
      }
    );

    expect(status).toBe(200);
    expect(body).toEqual({ count: 1 });
    await pointsOf(shipping.id, `?from=${at(0).toISOString()}`, 1);
  });

  test('deletes the points older than the 400 days of the retention', async () => {
    const day = 24 * 60 * MINUTE;
    await recordTeamMetrics(new Date(Date.now() - 401 * day));
    await recordTeamMetrics(new Date(Date.now() - 399 * day));
    const range = `?from=${new Date(Date.now() - 500 * day).toISOString()}&to=${at(-1).toISOString()}`;
    await pointsOf(billing.id, range, 2);

    // Run every hour by the store, at once here
    const deleted = await inject<DatabaseTimeSeries>(TimeSeries as any).purge();

    expect(deleted).toBeGreaterThanOrEqual(1);
    await pointsOf(billing.id, range, 1);
  });

  test('deletes the points of a team with it', async () => {
    const support = await team('Support');
    await recordTeamMetrics(at(30));
    await pointsOf(support.id, `?from=${at(0).toISOString()}`, 1);

    await db().team.delete({ where: { id: support.id } });

    await expect(
      db().teamSeries.count({ where: { resourceId: support.id } })
    ).resolves.toBe(0);
    expect((await series(support.id, '')).status).toBe(404);
  });
});
