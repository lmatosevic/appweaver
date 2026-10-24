import { hashPassword, systemConfig } from '@appweaver/data';
import { randomString } from '@appweaver/common';
import { db } from '@db/client';

export async function createRolesAndAdminUser(): Promise<void> {
  const adminRole = await db.role.create({
    data: {
      name: 'Admin',
      permissions: {
        connectOrCreate: [
          { where: { name: 'manage' }, create: { name: 'manage' } },
          { where: { name: 'view' }, create: { name: 'view' } }
        ]
      }
    }
  });

  // Assigned to the users who sign up, see the user service
  await db.role.create({
    data: {
      name: 'User',
      permissions: {
        connectOrCreate: [{ where: { name: 'view' }, create: { name: 'view' } }]
      }
    }
  });

  let password = systemConfig.ADMIN_INITIAL_PASSWORD;

  if (!password) {
    password = randomString(16, { extra: false });
    console.log(`Generated admin password: ${password}`);
  }

  const passwordHash = await hashPassword(password);

  await db.user.create({
    data: {
      firstName: 'Admin',
      lastName: 'Admin',
      email: systemConfig.ADMIN_INITIAL_EMAIL,
      passwordHash,
      roles: {
        connect: { id: adminRole.id }
      }
    }
  });
}
