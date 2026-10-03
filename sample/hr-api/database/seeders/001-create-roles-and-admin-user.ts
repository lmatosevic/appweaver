import { hashPassword } from '@appweaver/core';
import { config, randomString } from '@appweaver/common';
import { db } from '@db/client';
import { Permission } from '@/features/access/permissions';

/** Roles group the permissions the routes and policies check. */
const roles: Record<string, string[]> = {
  Admin: ['manage', 'view', ...Object.values(Permission)],
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

export async function createRolesAndAdminUser(): Promise<void> {
  for (const [name, permissions] of Object.entries(roles)) {
    await db.role.create({
      data: {
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

  let password = config.SYSTEM_ADMIN_INITIAL_PASSWORD;

  if (!password) {
    password = randomString(16, { extra: false });
    console.log(`Generated admin password: ${password}`);
  }

  await db.employee.create({
    data: {
      employeeNumber: 'EMP-0001',
      firstName: 'System',
      lastName: 'Admin',
      email: config.SYSTEM_ADMIN_INITIAL_EMAIL,
      hireDate: new Date('2020-01-01T00:00:00.000Z'),
      employmentType: 'Contractor',
      passwordHash: await hashPassword(password),
      verifiedEmail: true,
      roles: { connect: [{ name: 'Admin' }, { name: 'Employee' }] }
    }
  });
}
