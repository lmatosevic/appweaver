import { hashPassword } from '@appweaver/core';
import { config, logger, randomString } from '@appweaver/common';
import { db } from '@db/client';

export async function seedAdminUser(): Promise<void> {
  let password = config.SYSTEM_ADMIN_INITIAL_PASSWORD;

  if (!password) {
    password = randomString();
    logger.info(`Generated admin password: ${password}`);
  }

  const passwordHash = await hashPassword(password);

  const admin = await db.user.create({
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

  logger.info(`Admin user created with ID: ${admin.id}`);
}

seedAdminUser().catch((err) => {
  logger.error(`Error creating admin user: ${err.message}`);
});
