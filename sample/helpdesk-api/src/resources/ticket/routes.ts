import { createRoutes } from '@appweaver/core';
import { Role, staff } from '@/features/access/roles';

const staffAndIntegrations = {
  auth: ['jwt' as const, 'apiKey' as const],
  roles: [...staff, Role.Integration]
};

// Integrations open and follow their own tickets (see the policy), the staff
// works all of them
export default createRoutes({
  modelName: 'Ticket',
  path: '/tickets',
  find: staffAndIntegrations,
  query: staffAndIntegrations,
  create: {
    ...staffAndIntegrations,
    rateLimit: { max: 60, timeWindow: '1 minute' }
  },
  aggregate: {
    roles: staff
  },
  update: {
    roles: staff
  },
  delete: {
    roles: [Role.Admin]
  },
  export: {
    roles: staff
  }
});
