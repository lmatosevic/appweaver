import { createRoutes } from '@appweaver/web';
import { Permission } from '@/features/access/permissions';

export default createRoutes({
  modelName: 'Position',
  path: '/positions',
  find: {
    cache: { ttl: 300_000 }
  },
  query: {
    cache: { ttl: 300_000 }
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
