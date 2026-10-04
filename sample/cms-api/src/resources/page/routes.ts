import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'Page',
  path: '/pages',
  // The cache options apply only to the read routes
  defaults: {
    roles: ['Admin'],
    cacheTTL: 300_000
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
