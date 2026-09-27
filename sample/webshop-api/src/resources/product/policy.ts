import { createPolicy, hasRole } from '@appweaver/core';
import { Role } from '@/features/access/roles';

export default createPolicy({
  modelName: 'Product',
  // Drafts and archived products stay out of the storefront. The public read
  // routes carry no user, so admins reach them through the routes that sign
  // them in (update, export, aggregate)
  readRestrictions: (user) =>
    user && hasRole(user, Role.Admin) ? {} : { status: 'Active' },
  files: {
    images: {
      accessType: 'public'
    }
  }
});
