import { createPolicy, hasRoles } from '@appweaver/core';
import { staff } from '@/features/access/roles';

export default createPolicy({
  modelName: 'TicketMessage',
  // An integration sees the public messages of its own tickets only
  readRestrictions: (user) =>
    !user || hasRoles(user, staff)
      ? {}
      : { internal: false, ticket: { createdById: user.id } },
  // An agent writes as themselves, an integration relays the customer
  writeRestrictions: (user, _, action) => {
    if (!user || action !== 'create') {
      return null;
    }

    return hasRoles(user, staff)
      ? { author: user.id }
      : { fromCustomer: true, internal: false };
  },
  // Messages are edited by their author only
  checkAccess: (user, message, action) =>
    action !== 'update' || !user || message.authorId === user.id
});
