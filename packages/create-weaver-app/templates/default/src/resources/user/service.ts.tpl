import { createAuthService } from '@appweaver/core';
import { UserCreate } from '@/types';

export default createAuthService<UserCreate>({
  modelName: 'User',
  registrationData: (_, email, password, data) => {
    return {
      email,
      password: password ?? '',
      firstName: data?.firstName ?? '',
      lastName: data?.lastName ?? '',
      roles: [{ id: 1 }]
    };
  }
});
