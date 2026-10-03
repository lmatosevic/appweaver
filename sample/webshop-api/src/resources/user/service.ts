import { createAuthService } from '@appweaver/core';

// Customers register through the /register route, admins create other users
export default createAuthService({
  modelName: 'User',
  textSearch: {
    OR: {
      firstName: {
        contains: '{input}',
        mode: 'insensitive'
      },
      lastName: {
        contains: '{input}',
        mode: 'insensitive'
      },
      email: {
        contains: '{input}',
        mode: 'insensitive'
      }
    }
  }
});
