import { createRoutes } from '@appweaver/core';
import { catalogEditors } from '@/features/access/roles';

// Anyone reads the reviews and their rating statistics, members write them
export default createRoutes({
  modelName: 'Review',
  path: '/reviews',
  find: {
    public: true
  },
  query: {
    public: true,
    cacheTTL: 30_000
  },
  aggregate: {
    public: true,
    cacheTTL: 300_000
  },
  create: {
    rateLimit: {
      max: 10,
      timeWindow: '1 hour'
    }
  },
  export: {
    roles: catalogEditors
  }
});
