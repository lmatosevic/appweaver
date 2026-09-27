import { hashPassword } from '@appweaver/core';
import { config, randomString } from '@appweaver/common';
import { db } from '@db/client';

export async function createAdmin(): Promise<void> {
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
