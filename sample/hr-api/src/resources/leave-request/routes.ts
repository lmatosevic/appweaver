import { createRoutes } from '@appweaver/core';
import { Permission } from '@/features/access/permissions';

// Approving, rejecting and cancelling have their own routes (see the leave
// feature), the policy limits what an employee sees and changes
export default createRoutes({
  modelName: 'LeaveRequest',
  path: '/leave-requests',
  aggregate: {
    permissions: [Permission.LeaveManage]
  },
  delete: {
    permissions: [Permission.LeaveManage]
  },
  export: {
    permissions: [Permission.LeaveManage]
  }
});
