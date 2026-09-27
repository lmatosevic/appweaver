import { createRoutes } from '@appweaver/core';
import { Role } from '@/features/access/roles';

// Orders are placed through /checkout and moved along by the workflow routes
// (see the orders feature), customers read their own
export default createRoutes({
  modelName: 'Order',
  path: '/orders',
  find: {
    auth: ['jwt', 'apiKey']
  },
  query: {
    auth: ['jwt', 'apiKey']
  },
  // Sales reports, i.e. the revenue per day
  aggregate: {
    roles: [Role.Admin]
  },
  create: {
    exclude: true
  },
  update: {
    roles: [Role.Admin]
  },
  delete: {
    exclude: true
  },
  export: {
    roles: [Role.Admin]
  }
});
