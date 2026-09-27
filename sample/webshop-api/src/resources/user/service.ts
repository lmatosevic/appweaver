import { createAuthService } from '@appweaver/core';
import { UserCreate } from '@/types';

// Customers register through the /register route, admins create other users
export default createAuthService<UserCreate>({
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
