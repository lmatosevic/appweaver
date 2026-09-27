import { createRoutes } from '@appweaver/core';
import { Role, staff } from '@/features/access/roles';

export default createRoutes({
  modelName: 'SlaPolicy',
  path: '/sla-policies',
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
    roles: [Role.Admin]
  },
  delete: {
    roles: [Role.Admin]
  },
  export: {
    exclude: true
  }
});
