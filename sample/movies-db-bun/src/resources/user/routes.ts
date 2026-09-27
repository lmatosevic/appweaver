import { createRoutes } from '@appweaver/core';
import { Role } from '@/features/access/roles';

// Members edit their own profile, only admins browse and manage accounts
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
    exclude: true
  }
});
