import { createPolicy, hasRoles } from '@appweaver/core';
import { Role } from '@/features/access/roles';

export default createPolicy({
  modelName: 'Order',
  // Customers see their own orders, the staff and the warehouse all of them
  readRestrictions: (user) =>
    !user || hasRoles(user, [Role.Admin, Role.Fulfillment])
      ? {}
      : { customerId: user.id }
});
