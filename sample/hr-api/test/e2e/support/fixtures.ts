import { Database } from '@appweaver/common';
import { Application, inject, injectService } from '@appweaver/core';
import { Permission } from '@/features/access/permissions';

export const PASSWORD = 'Passw0rd!';

const rolePermissions: Record<string, string[]> = {
  HR: [
    Permission.EmployeeManage,
    Permission.LeaveManage,
    Permission.LeaveApprove,
    Permission.DocumentManage,
    Permission.ReviewWrite,
    Permission.ReviewManage
  ],
  Payroll: [Permission.PayrollRead, Permission.PayrollWrite],
  Manager: [Permission.LeaveApprove, Permission.ReviewWrite],
  Employee: []
};

/** Creates the roles of the seeder, unless an earlier test file did. */
export async function createRoles(): Promise<void> {
  const db = inject<any>(Database).client();

  for (const [name, permissions] of Object.entries(rolePermissions)) {
    await db.role.upsert({
      where: { name },
      update: {},
      create: {
        name,
        permissions: {
          connectOrCreate: permissions.map((permission) => ({
            where: { name: permission },
            create: { name: permission }
          }))
        }
      }
    });
  }
}

/**
 * Hires an employee through the service, as HR does, so the onboarding runs.
 * The email is derived from the first name, unique within a test file.
 */
export async function hire(
  firstName: string,
  data: {
    roles?: string[];
    manager?: string;
    hireDate?: string;
    employmentType?: 'FullTime' | 'PartTime' | 'Contractor' | 'Intern';
  } = {}
): Promise<any> {
  const db = inject<any>(Database).client();
  const roles = await db.role.findMany({
    where: { name: { in: [...(data.roles ?? []), 'Employee'] } }
  });

  return injectService('Employee').create({
    firstName,
    lastName: 'Tester',
    email: `${firstName.toLowerCase()}@test.example.com`,
    password: PASSWORD,
    hireDate: data.hireDate ?? '2024-01-15T00:00:00.000Z',
    employmentType: data.employmentType ?? 'FullTime',
    manager: data.manager,
    roles: roles.map((role: any) => ({ id: role.id }))
  });
}

/** Signs the employee in, returning the authorization header. */
export async function signIn(
  app: Application,
  employee: { email: string }
): Promise<Record<string, string>> {
  const response = await app.server.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { username: employee.email, password: PASSWORD }
  });

  return { authorization: `Bearer ${response.json().accessToken}` };
}

/** A Monday some weeks ahead, so a request is always in the future. */
export function futureMonday(weeks: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  date.setUTCDate(date.getUTCDate() + ((8 - date.getUTCDay()) % 7));
  return date;
}

/** The Friday of the week starting on the given Monday. */
export function fridayOf(monday: Date): Date {
  const date = new Date(monday);
  date.setUTCDate(date.getUTCDate() + 4);
  return date;
}

/** Sets the leave balance of the employee for the year of the date. */
export async function setBalance(
  employeeId: string,
  date: Date,
  allowanceDays: number,
  usedDays = 0
): Promise<void> {
  const db = inject<any>(Database).client();
  const year = date.getUTCFullYear();

  await db.leaveBalance.upsert({
    where: { employeeId_year: { employeeId, year } },
    update: { allowanceDays, usedDays, carriedOverDays: 0 },
    create: { employeeId, year, allowanceDays, usedDays }
  });
}
