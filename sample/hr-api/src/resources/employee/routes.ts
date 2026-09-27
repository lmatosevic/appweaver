import { createRoutes } from '@appweaver/core';
import { Permission } from '@/features/access/permissions';

// The directory is open to every employee, the policy decides who may change
// which profile
export default createRoutes({
  modelName: 'Employee',
  path: '/employees',
  query: {
    cacheTTL: 30_000
  },
  aggregate: {
    permissions: [Permission.EmployeeManage]
  },
  create: {
    permissions: [Permission.EmployeeManage]
  },
  delete: {
    permissions: [Permission.EmployeeManage]
  },
  export: {
    permissions: [Permission.EmployeeManage]
  }
});
