import { createRoutes } from '@appweaver/core';
import { Role, staff } from '@/features/access/roles';

// Mostly created on the fly with the tickets, see the ticket model
export default createRoutes({
  modelName: 'Tag',
  path: '/tags',
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
    roles: staff
  },
  update: {
    roles: staff
  },
  delete: {
    roles: [Role.Admin]
  },
  export: {
    exclude: true
  }
});
