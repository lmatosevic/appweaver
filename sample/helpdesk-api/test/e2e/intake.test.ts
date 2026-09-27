import { Application, createApp } from '@appweaver/core';
import { resetTestData } from './support/reset';
import {
  agent,
  createRoles,
  db,
  eventually,
  request,
  RUN,
  team
} from './support/fixtures';

/**
 * How tickets come in: the public support form, the customers matched by
 * email, the SLA deadlines, the automatic assignment to the least loaded
 * agent of the team, and the escalation of the overdue tickets.
 */
describe('Ticket intake', () => {
  let app: Application;
  let supportTeam: { id: number };
  let busy: Awaited<ReturnType<typeof agent>>;
  let idle: Awaited<ReturnType<typeof agent>>;

  const email = (name: string) => `${name}.${RUN}@customer.example.com`;

  const submit = (name: string, subject: string) =>
    request(app, 'POST', '/support/tickets', {
      payload: {
        name,
        email: email(name),
        subject,
        description: 'Something is not working as expected.'
      }
    });

  const ticketOf = (reference: string) =>
    db().ticket.findUnique({
      where: { reference },
      include: { customer: true, messages: true }
    });

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    await createRoles();

    supportTeam = await team('Support');
    busy = await agent(app, `Busy${RUN}`, { teamId: supportTeam.id });
    idle = await agent(app, `Idle${RUN}`, { teamId: supportTeam.id });
    await agent(app, `Away${RUN}`, {
      teamId: supportTeam.id,
      available: false
    });

    // Busy already holds an open ticket
    const customer = await db().customer.create({
      data: { email: email('existing'), name: 'Existing' }
    });
    await db().ticket.create({
      data: {
        reference: `HD-B${RUN}`.slice(0, 20),
        subject: 'Already open',
        status: 'Open',
        customerId: customer.id,
        teamId: supportTeam.id,
        assigneeId: busy.id
      }
    });
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('opens a ticket from the public form, returning the reference only', async () => {
    const { status, body } = await submit('ana', 'Cannot find my invoice');

    expect(status).toBe(201);
    expect(Object.keys(body).sort()).toEqual(['reference', 'status']);
    expect(body).toMatchObject({ status: 'New' });

    const ticket = await ticketOf(body.reference);
    expect(ticket).toMatchObject({ channel: 'Web', priority: 'Normal' });
    expect(ticket.messages).toHaveLength(1);
    expect(ticket.messages[0]).toMatchObject({ fromCustomer: true });
  });

  test('sets the deadlines from the SLA policy of the priority', async () => {
    await db().slaPolicy.upsert({
      where: { priority: 'Normal' },
      update: { firstResponseMinutes: 60, resolutionMinutes: 600 },
      create: {
        priority: 'Normal',
        firstResponseMinutes: 60,
        resolutionMinutes: 600
      }
    });

    const { body } = await submit('ben', 'Question about my plan');
    const ticket = await ticketOf(body.reference);

    const minutes = (due: Date) =>
      Math.round((due.getTime() - ticket.createdAt.getTime()) / 60_000);
    expect(minutes(ticket.firstResponseDueAt)).toBe(60);
    expect(minutes(ticket.resolutionDueAt)).toBe(600);
  });

  test('matches a returning customer by email', async () => {
    await submit('cleo', 'First question');
    await submit('cleo', 'Second question');

    const customers = await db().customer.findMany({
      where: { email: email('cleo') },
      include: { _count: { select: { tickets: true } } }
    });

    expect(customers).toHaveLength(1);
    expect(customers[0]._count.tickets).toBe(2);
  });

  test('assigns the least loaded available agent of the team', async () => {
    const { body } = await request(app, 'POST', '/tickets', {
      headers: busy.auth,
      payload: {
        subject: 'Routed to the support team',
        description: 'Please help.',
        team: supportTeam.id,
        customer: { email: email('dora'), name: 'Dora' }
      }
    });

    const assigneeId = await eventually(
      async () => (await ticketOf(body.reference)).assigneeId,
      (id) => id !== null
    );

    expect(assigneeId).toBe(idle.id);
  });

  test('escalates an overdue ticket once, raising its priority', async () => {
    const { escalateOverdueTickets } =
      await import('@/features/sla/escalation-job');
    const { body } = await submit('eve', 'Overdue');
    await db().ticket.update({
      where: { reference: body.reference },
      data: { resolutionDueAt: new Date(Date.now() - 60_000) }
    });

    await escalateOverdueTickets();
    const once = await ticketOf(body.reference);
    await escalateOverdueTickets();
    const twice = await ticketOf(body.reference);

    expect(once).toMatchObject({ escalated: true, priority: 'High' });
    expect(twice.priority).toBe('High');
  });
});
