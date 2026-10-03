import { createAuthService } from '@appweaver/core';

// Accounts are opened by an admin, a sign-in never registers a new one
export default createAuthService({
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
