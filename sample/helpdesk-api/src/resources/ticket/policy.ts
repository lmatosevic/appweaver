import { createPolicy, hasRoles } from '@appweaver/core';
import { staff } from '@/features/access/roles';

export default createPolicy({
  modelName: 'Ticket',
  // An integration sees the tickets it opened, the staff sees them all
  readRestrictions: (user) =>
    !user || hasRoles(user, staff) ? {} : { createdById: user.id }
});
