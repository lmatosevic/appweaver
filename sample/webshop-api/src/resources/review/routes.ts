import { createRoutes } from '@appweaver/core';
import { Role } from '@/features/access/roles';

export default createRoutes({
  modelName: 'Review',
  path: '/reviews',
  find: {
    public: true
  },
  query: {
    public: true,
    cacheTTL: 60_000
  },
  // The rating summary of a product page
  aggregate: {
    public: true,
    cacheTTL: 60_000
  },
  create: {
    rateLimit: { max: 10, timeWindow: '1 hour' }
  },
  export: {
    roles: [Role.Admin]
  }
});
