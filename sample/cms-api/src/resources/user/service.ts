import { createAuthService, HttpError } from '@appweaver/core';
import { UserCreate } from '@/types';

export default createAuthService<UserCreate>({
  modelName: 'User',
  checkOAuth2User: async (_, user) => {
    if (!user.email) {
      throw new HttpError('Email is required', 403);
    }
  },
  registrationData: (_, email, password, data) => {
    return {
      email,
      password: password ?? '',
      firstName: data?.firstName ?? '',
      lastName: data?.lastName ?? '',
      twoFactorAuth: 'None',
      phone: '',
      roles: [{ id: 1 }]
    };
  }
});
