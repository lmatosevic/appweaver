import { createPolicy } from '@appweaver/core';
import { can, Permission } from '@/features/access/permissions';

export default createPolicy({
  modelName: 'PerformanceReview',
  // Employees see their reviews once shared, reviewers the ones they wrote
  readRestrictions: (user) =>
    !user || can(user, Permission.ReviewManage)
      ? {}
      : {
          OR: [
            { employeeId: user.id, status: 'Shared' },
            { reviewerId: user.id }
          ]
        },
  writeRestrictions: (user, _, action) =>
    user && action === 'create' ? { reviewer: user.id } : null,
  checkAccess: (user, review, action) =>
    action !== 'update' ||
    !user ||
    can(user, Permission.ReviewManage) ||
    review.reviewerId === user.id
});
