import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'Category',
  path: '/categories',
  find: {
    public: true,
    cacheTTL: 60
  },
  query: {
    public: true,
    cacheTTL: 60
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
