import { createAuthService } from '@appweaver/core';
import db from '@db/client';
import { Role } from '@/features/access/roles';

// Members sign up with GitHub or Google, see the README to enable them
export default createAuthService({
  modelName: 'User',
  registrationData: async (_, email, password, data) => {
    const member = await db.role.findUniqueOrThrow({
      where: { name: Role.Member }
    });

    return {
      email,
      password: password ?? '',
      displayName:
        [data?.firstName, data?.lastName].filter(Boolean).join(' ') ||
        email.split('@')[0],
      twoFactorAuth: 'None',
      roles: [{ id: member.id }]
    };
  },
  registrationFiles: (_, data) => ({ avatar: data?.avatarFile })
});
