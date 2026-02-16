import { db, hashPassword } from '@appweaver/core';
import { config, logger, randomString } from '@appweaver/common';

export async function identityRolesPermissions(): Promise<any> {
  let password = config.SYSTEM_ADMIN_INITIAL_PASSWORD;

  if (!password) {
    password = randomString();
    logger.info(`Generated admin password: ${password}`);
  }

  const passwordHash = await hashPassword(password);

  await db.client.identity.create({
    data: {
      username: config.SYSTEM_ADMIN_INITIAL_EMAIL,
      passwordHash: passwordHash,
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

  logger.info(`Seeder finished`);
}

identityRolesPermissions().catch(() => {
  logger.error('Error creating identity roles');
});
