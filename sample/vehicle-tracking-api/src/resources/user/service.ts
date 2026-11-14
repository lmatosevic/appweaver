import { createAuthService } from '@appweaver/data';

// The accounts are created by an admin, there is no public registration
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
