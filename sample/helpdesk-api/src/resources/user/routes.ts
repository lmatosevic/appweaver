import { createRoutes } from '@appweaver/core';
import { Role, staff } from '@/features/access/roles';

// The staff sees the directory, agents edit their own profile (see the policy)
export default createRoutes({
  modelName: 'User',
  path: '/users',
  find: {
    roles: staff
  },
  query: {
    roles: staff
  },
  aggregate: {
    exclude: true
  },
  create: {
    roles: [Role.Admin]
  },
  update: {
    roles: staff
  },
  delete: {
    roles: [Role.Admin]
  },
  export: {
    roles: [Role.Admin]
  }
});
