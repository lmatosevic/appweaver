import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'Category',
  path: '/categories',
  // The cache options apply only to the read routes
  defaults: {
    roles: ['Admin'],
    cacheTTL: 60_000
  },
  find: {
    public: true
  },
  query: {
    public: true
  },
  aggregate: {
    exclude: true
  }
});
