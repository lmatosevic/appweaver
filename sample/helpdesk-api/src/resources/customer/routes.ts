import { createRoutes } from '@appweaver/core';
import { Role, staff } from '@/features/access/roles';

// Customers come in with their tickets, the staff keeps their details
export default createRoutes({
  modelName: 'Customer',
  path: '/customers',
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
    roles: [Role.Admin]
  }
});
