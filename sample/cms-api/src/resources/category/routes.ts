import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'Category',
  path: '/categories',
  find: {
    public: true,
    cacheTTL: 60_000
  },
  query: {
    public: true,
    cacheTTL: 60_000
  },
  aggregate: {
    exclude: true
  },
  create: {
    roles: ['Admin']
  },
  update: {
    roles: ['Admin']
  },
  delete: {
    roles: ['Admin']
  },
  export: {
    roles: ['Admin']
  }
});
