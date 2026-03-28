import { hashPassword } from '@appweaver/core';
import { config, randomString } from '@appweaver/common';
import { db } from '@db/client';

export async function createAdminUser(): Promise<void> {
  let password = config.SYSTEM_ADMIN_INITIAL_PASSWORD;

  if (!password) {
    password = randomString();
    console.log(`Generated admin password: ${password}`);
  }

  const passwordHash = await hashPassword(password);

  await db.user.create({
    data: {
      firstName: 'Admin',
      lastName: 'Admin',
      email: config.SYSTEM_ADMIN_INITIAL_EMAIL,
      phone: '01234435',
      passwordHash,
      roles: {
        connectOrCreate: [
          {
            where: { name: 'Admin' },
            create: {
              name: 'Admin',
              permissions: {
                connectOrCreate: [
                  { where: { name: '*.read' }, create: { name: '*.read' } },
                  { where: { name: '*.write' }, create: { name: '*.write' } }
                ]
              }
            }
          }
        ]
      }
    }
  });
}
