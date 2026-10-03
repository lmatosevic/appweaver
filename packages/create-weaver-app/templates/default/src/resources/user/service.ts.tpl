import { createAuthService } from '@appweaver/core';
import { db } from '@db/client';
import { UserCreate } from '@/types';

export default createAuthService<UserCreate>({
  modelName: 'User',
  registrationData: async (_, email, password, data) => {
    const role = await db.role.findUniqueOrThrow({ where: { name: 'User' } });

    return {
      email,
      password: password ?? '',
      firstName: data?.firstName ?? '',
      lastName: data?.lastName ?? '',
      twoFactorAuth: 'None',
      roles: [{ id: role.id }]
    };
  },
  registrationFiles: (_, data) => ({ avatar: data?.avatarFile })
});
