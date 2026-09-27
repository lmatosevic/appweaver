import { createRoutes } from '@appweaver/core';
import { Role } from '@/features/access/roles';

// Customers edit their own profile (see the policy), admins manage the accounts
export default createRoutes({
  modelName: 'User',
  path: '/users',
  find: {
    roles: [Role.Admin]
  },
  query: {
    roles: [Role.Admin]
  },
  aggregate: {
    roles: [Role.Admin]
  },
  create: {
    roles: [Role.Admin]
  },
  delete: {
    roles: [Role.Admin]
  },
  export: {
    roles: [Role.Admin]
  }
});
