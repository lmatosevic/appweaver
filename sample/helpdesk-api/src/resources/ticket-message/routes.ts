import { createRoutes } from '@appweaver/core';
import { Role, staff } from '@/features/access/roles';

const staffAndIntegrations = {
  auth: ['jwt' as const, 'apiKey' as const],
  roles: [...staff, Role.Integration]
};

// Threads are long, so they are read page by page with a cursor
export default createRoutes({
  modelName: 'TicketMessage',
  path: '/messages',
  find: staffAndIntegrations,
  query: staffAndIntegrations,
  create: staffAndIntegrations,
  fileUpload: staffAndIntegrations,
  aggregate: {
    exclude: true
  },
  update: {
    roles: staff
  },
  delete: {
    roles: [Role.Admin]
  },
  export: {
    exclude: true
  }
});
