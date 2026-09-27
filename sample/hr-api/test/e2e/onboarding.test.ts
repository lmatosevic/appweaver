import { Application, createApp, injectService } from '@appweaver/core';
import { LeaveBalanceResourceService } from '@/types';
import { resetTestData } from './support/reset';
import { createRoles, hire, setBalance, signIn } from './support/fixtures';

/**
 * The work done around a hire outside of the request: the employee number,
 * the balance opened by the event listener, the balances opened for a new
 * year by the scheduled job, and the headcount report.
 */
describe('Onboarding', () => {
  let app: Application;

  const balances = (employeeId: string) =>
    injectService<LeaveBalanceResourceService>('LeaveBalance').query({
      employee: employeeId
    });

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    await createRoles();
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  test('numbers the employees in the order they are hired', async () => {
    const first = await hire('Nora');
    const second = await hire('Noel');

    const number = (employee: any) =>
      parseInt(employee.employeeNumber.slice(4), 10);
    expect(first.employeeNumber).toMatch(/^EMP-\d{4}$/);
    expect(number(second)).toBe(number(first) + 1);
  });

  test('opens a prorated balance for the year of the hire', async () => {
    const employee = await hire('Olga', {
      hireDate: '2026-10-01T00:00:00.000Z'
    });

    const { items } = await balances(employee.id);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ year: 2026, allowanceDays: 6 });
  });

  test('opens no balance for a contractor', async () => {
    const contractor = await hire('Carl', { employmentType: 'Contractor' });

    const { items } = await balances(contractor.id);

    expect(items).toHaveLength(0);
  });

  test('carries unused days over into the new year, up to the limit', async () => {
    const saver = await hire('Sam', { hireDate: '2020-01-01T00:00:00.000Z' });
    const spender = await hire('Tia', { hireDate: '2020-01-01T00:00:00.000Z' });
    await setBalance(saver.id, new Date('2030-06-01'), 24, 10);
    await setBalance(spender.id, new Date('2030-06-01'), 24, 22);

    // Loaded once the application provides the database client
    const { openLeaveYear } = await import('@/features/leave/leave-accrual');
    await openLeaveYear(2031);

    const carried = async (employeeId: string) =>
      (await balances(employeeId)).items.find((b: any) => b.year === 2031)
        ?.carriedOverDays;
    expect(await carried(saver.id)).toBe(5);
    expect(await carried(spender.id)).toBe(2);
  });

  // The first sign-in of the run generates the token signing keys
  test('reports the headcount per employment type', async () => {
    const hr = await hire('Hugo', { roles: ['HR'] });
    await hire('Ina', { employmentType: 'Intern' });

    const response = await app.server.inject({
      method: 'GET',
      url: '/api/reports/headcount',
      headers: await signIn(app, hr)
    });

    const types = Object.fromEntries(
      response
        .json()
        .byEmploymentType.map((group: any) => [
          group.employmentType,
          group.headcount
        ])
    );
    expect(types).toMatchObject({ Contractor: 1, Intern: 1 });
    expect(response.json().total).toBeGreaterThanOrEqual(8);
  }, 30_000);
});
