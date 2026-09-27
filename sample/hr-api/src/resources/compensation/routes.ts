import { createRoutes } from '@appweaver/core';
import { Permission } from '@/features/access/permissions';

// Employees read their own pay history, the policy hides everyone else's
export default createRoutes({
  modelName: 'Compensation',
  path: '/compensations',
  aggregate: {
    permissions: [Permission.PayrollRead]
  },
  create: {
    permissions: [Permission.PayrollWrite]
  },
  update: {
    permissions: [Permission.PayrollWrite]
  },
  delete: {
    permissions: [Permission.PayrollWrite]
  },
  export: {
    permissions: [Permission.PayrollRead]
  }
});
