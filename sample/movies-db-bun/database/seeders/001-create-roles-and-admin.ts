import { hashPassword } from '@appweaver/core';
import { config, randomString } from '@appweaver/common';
import { db } from '@db/client';
import { Role } from '@/features/access/roles';

export async function createRolesAndAdmin(): Promise<void> {
  for (const name of Object.values(Role)) {
    await db.role.create({ data: { name } });
  }

  let password = config.SYSTEM_ADMIN_INITIAL_PASSWORD;
  if (!password) {
    password = randomString(16, { extra: false });
    console.log(`Generated admin password: ${password}`);
  }

  await db.user.create({
    data: {
      displayName: 'Admin',
      email: config.SYSTEM_ADMIN_INITIAL_EMAIL,
      passwordHash: await hashPassword(password),
      verifiedEmail: true,
      roles: { connect: [{ name: Role.Admin }, { name: Role.Curator }] }
    }
  });
}
