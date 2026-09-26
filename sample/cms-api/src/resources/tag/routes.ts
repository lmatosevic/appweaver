import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'Tag',
  path: '/tags',
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
    roles: ['Admin', 'User']
  },
  update: {
    roles: ['Admin']
  },
  delete: {
    roles: ['Admin']
  },
  export: {
    exclude: true
  }
});
