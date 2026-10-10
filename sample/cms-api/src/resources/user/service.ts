import { ErrorCode } from '@appweaver/common';
import { createAuthService, OAuth2Error } from '@appweaver/core';
import db from '@db/client';

export default createAuthService({
  modelName: 'User',
  checkOAuth2User: async (source, user) => {
    if (!user.email) {
      throw new OAuth2Error(
        ErrorCode.OAuth2EmailUnavailable,
        'Email is required',
        { provider: source }
      );
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
