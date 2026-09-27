import { createPolicy, hasRoles } from '@appweaver/core';
import { catalogEditors } from '@/features/access/roles';

export default createPolicy({
  modelName: 'Review',
  writeRestrictions: (user, _, action) =>
    user && action === 'create' ? { author: user.id } : null,
  // Authors edit their reviews, curators moderate them
  checkAccess: (user, review, action) =>
    !['update', 'delete'].includes(action) ||
    !user ||
    review.authorId === user.id ||
    hasRoles(user, catalogEditors)
});
