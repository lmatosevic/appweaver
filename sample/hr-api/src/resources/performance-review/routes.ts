import { createRoutes } from '@appweaver/core';
import { Permission } from '@/features/access/permissions';

export default createRoutes({
  modelName: 'PerformanceReview',
  path: '/performance-reviews',
  aggregate: {
    permissions: [Permission.ReviewManage]
  },
  create: {
    permissions: [Permission.ReviewWrite, Permission.ReviewManage]
  },
  update: {
    permissions: [Permission.ReviewWrite, Permission.ReviewManage]
  },
  delete: {
    permissions: [Permission.ReviewManage]
  },
  export: {
    permissions: [Permission.ReviewManage]
  }
});
