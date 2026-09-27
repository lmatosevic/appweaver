import { createAuthService } from '@appweaver/core';
import { UserCreate } from '@/types';

// Accounts are opened by an admin, a sign-in never registers a new one
export default createAuthService<UserCreate>({
  modelName: 'User',
  checkOAuth2User: (_, __, authUser) => {
    if (!authUser) {
      return 'Only existing staff members can sign in';
    }
  },
  textSearch: {
    OR: {
      name: {
        contains: '{input}'
      },
      email: {
        contains: '{input}'
      }
    }
  }
});
