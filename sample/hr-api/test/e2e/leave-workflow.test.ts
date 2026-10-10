import { Application, createApp, injectService } from '@appweaver/core';
import { resetTestData } from './support/reset';
import {
  createRoles,
  fridayOf,
  futureMonday,
  hire,
  setBalance,
  signIn
} from './support/fixtures';

/**
 * Walks leave requests through their states over HTTP: filing, the approval by
 * the manager booking the days against the balance, the rejection, and the
 * cancellation giving the days back.
 */
describe('Leave workflow', () => {
  let app: Application;
  let manager: any;
  let employee: any;
  let colleague: any;
  let hr: any;
  let as: Record<string, Record<string, string>>;

  const request = async (
    auth: Record<string, string>,
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: object
  ) => {
    const response = await app.server.inject({
      method,
      url: `/api${url}`,
      headers: auth,
      payload
    });
    return { status: response.statusCode, body: response.json() };
  };

  const file = (auth: Record<string, string>, start: Date, end: Date) =>
    request(auth, 'POST', '/leave-requests', {
      type: 'Annual',
      startDate: start.toISOString(),
      endDate: end.toISOString()
    });

  const balanceOf = async (employeeId: string, date: Date) =>
    (
      await injectService('LeaveBalance').query({
        filter: { employee: employeeId, year: date.getUTCFullYear() }
      })
    ).items[0];

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    await createRoles();

    manager = await hire('Mia', { roles: ['Manager'] });
    employee = await hire('Eva', { manager: manager.id });
    colleague = await hire('Ian');
    hr = await hire('Hana', { roles: ['HR'] });

    as = {
      manager: await signIn(app, manager),
      employee: await signIn(app, employee),
      colleague: await signIn(app, colleague),
      hr: await signIn(app, hr)
    };
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('files the request for the signed-in employee', async () => {
    const monday = futureMonday(3);

    const { status, body } = await file(as.employee, monday, fridayOf(monday));

    expect(status).toBe(201);
    expect(body).toMatchObject({
      status: 'Pending',
      days: 5,
      employee: { id: employee.id }
    });
  });

  test('rejects a period overlapping an open request', async () => {
    const monday = futureMonday(5);
    await file(as.employee, monday, fridayOf(monday));

    const { status } = await file(
      as.employee,
      fridayOf(monday),
      fridayOf(monday)
    );

    expect(status).toBe(409);
  });

  test('approves and books the days against the balance', async () => {
    const monday = futureMonday(7);
    await setBalance(employee.id, monday, 20);
    const filed = await file(as.employee, monday, fridayOf(monday));

    const { status, body } = await request(
      as.manager,
      'POST',
      `/leave-requests/${filed.body.id}/approve`,
      { note: 'Enjoy!' }
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      status: 'Approved',
      decisionNote: 'Enjoy!',
      decidedBy: { id: manager.id }
    });
    expect(await balanceOf(employee.id, monday)).toMatchObject({
      usedDays: 5,
      remainingDays: 15
    });
  });

  test('refuses to approve more days than remain', async () => {
    const monday = futureMonday(9);
    await setBalance(employee.id, monday, 20, 18);
    const filed = await file(as.employee, monday, fridayOf(monday));

    const { status, body } = await request(
      as.manager,
      'POST',
      `/leave-requests/${filed.body.id}/approve`,
      {}
    );

    expect(status).toBe(409);
    expect(body.code).toBe('LEAVE_BALANCE_EXCEEDED');
    expect(body.details).toEqual({ requested: 5, remaining: 2 });
  });

  test('lets only the manager of the employee decide', async () => {
    const monday = futureMonday(11);
    const filed = await colleagueFiles(monday);

    const { status } = await request(
      as.manager,
      'POST',
      `/leave-requests/${filed.body.id}/approve`,
      {}
    );

    expect(status).toBe(403);
  });

  test('lets a leave manager decide for anyone', async () => {
    const monday = futureMonday(13);
    const filed = await colleagueFiles(monday);

    const { status, body } = await request(
      as.hr,
      'POST',
      `/leave-requests/${filed.body.id}/reject`,
      { note: 'Team offsite that week' }
    );

    expect(status).toBe(200);
    expect(body.status).toBe('Rejected');
  });

  test('denies deciding without the permission', async () => {
    const monday = futureMonday(15);
    const filed = await file(as.employee, monday, monday);

    const { status } = await request(
      as.employee,
      'POST',
      `/leave-requests/${filed.body.id}/approve`,
      {}
    );

    expect(status).toBe(403);
  });

  test('gives the days back when an approved leave is cancelled', async () => {
    const monday = futureMonday(17);
    await setBalance(employee.id, monday, 20);
    const filed = await file(as.employee, monday, fridayOf(monday));
    await request(
      as.manager,
      'POST',
      `/leave-requests/${filed.body.id}/approve`,
      {}
    );

    const { status, body } = await request(
      as.employee,
      'POST',
      `/leave-requests/${filed.body.id}/cancel`
    );

    expect(status).toBe(200);
    expect(body.status).toBe('Cancelled');
    expect((await balanceOf(employee.id, monday)).usedDays).toBe(0);
  });

  test('shows employees their own requests and managers their team', async () => {
    await colleagueFiles(futureMonday(19));

    const own = await request(
      as.colleague,
      'POST',
      '/leave-requests/query',
      {}
    );
    const team = await request(as.manager, 'POST', '/leave-requests/query', {});

    const owners = (body: any) =>
      new Set(body.items.map((item: any) => item.employee.id));
    expect(owners(own.body)).toEqual(new Set([colleague.id]));
    expect(owners(team.body)).toEqual(new Set([employee.id]));
  });

  test('locks a decided request for the employee', async () => {
    const monday = futureMonday(21);
    await setBalance(employee.id, monday, 20);
    const filed = await file(as.employee, monday, monday);
    await request(
      as.manager,
      'POST',
      `/leave-requests/${filed.body.id}/approve`,
      {}
    );

    const { status } = await request(
      as.employee,
      'PUT',
      `/leave-requests/${filed.body.id}`,
      { reason: 'Changed my mind' }
    );

    expect(status).toBe(403);
  });

  function colleagueFiles(monday: Date) {
    return file(as.colleague, monday, fridayOf(monday));
  }
});
