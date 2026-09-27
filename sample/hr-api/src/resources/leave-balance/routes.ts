import { createRoutes } from '@appweaver/core';
import { Permission } from '@/features/access/permissions';

export default createRoutes({
  modelName: 'LeaveBalance',
  path: '/leave-balances',
  aggregate: {
    exclude: true
  },
  create: {
    permissions: [Permission.LeaveManage]
  },
  update: {
    permissions: [Permission.LeaveManage]
  },
  delete: {
    permissions: [Permission.LeaveManage]
  },
  export: {
    permissions: [Permission.LeaveManage]
  }
});
