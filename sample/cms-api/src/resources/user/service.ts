import { createAuthService, HttpError } from '@appweaver/core';
import db from '@db/client';

export default createAuthService({
  modelName: 'User',
  checkOAuth2User: async (_, user) => {
    if (!user.email) {
      throw new HttpError('Email is required', 403);
    }
  },
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
  registrationFiles: (_, data) => {
    return { avatar: data?.avatarFile };
  }
});
