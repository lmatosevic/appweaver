import { createRoutes } from '@appweaver/core';
import { staff } from '@/features/access/roles';

export default createRoutes({
  modelName: 'CannedResponse',
  path: '/canned-responses',
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
    roles: staff
  },
  export: {
    exclude: true
  }
});
