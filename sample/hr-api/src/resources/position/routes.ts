import { createRoutes } from '@appweaver/core';
import { Permission } from '@/features/access/permissions';

export default createRoutes({
  modelName: 'Position',
  path: '/positions',
  find: {
    cacheTTL: 300_000
  },
  query: {
    cacheTTL: 300_000
  },
  aggregate: {
    permissions: [Permission.PayrollRead]
  },
  create: {
    permissions: [Permission.EmployeeManage]
  },
  update: {
    permissions: [Permission.EmployeeManage]
  },
  delete: {
    permissions: [Permission.EmployeeManage]
  },
  export: {
    permissions: [Permission.EmployeeManage]
  }
});
