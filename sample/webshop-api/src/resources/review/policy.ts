import { createPolicy, hasRole } from '@appweaver/core';
import { Role } from '@/features/access/roles';

export default createPolicy({
  modelName: 'Review',
  writeRestrictions: (user, _, action) =>
    user && action === 'create' ? { author: user.id } : null,
  // Authors edit their reviews, admins moderate them
  checkAccess: (user, review, action) =>
    !['update', 'delete'].includes(action) ||
    !user ||
    review.authorId === user.id ||
    hasRole(user, Role.Admin)
});
