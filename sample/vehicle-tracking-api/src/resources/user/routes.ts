import { createRoutes } from '@appweaver/web';
import { Role } from '@/features/access/roles';

// Users edit their own profile (see the policy), admins manage the accounts,
// and the dispatchers look up the drivers
export default createRoutes({
  modelName: 'User',
  path: '/users',
  find: {
    roles: [Role.Admin, Role.Dispatcher]
  },
  query: {
    roles: [Role.Admin, Role.Dispatcher]
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
