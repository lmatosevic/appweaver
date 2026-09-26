import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'Page',
  path: '/pages',
  find: {
    public: true,
    cacheTTL: 300_000
  },
  query: {
    public: true,
    cacheTTL: 300_000
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
  },
  fileUpload: {
    roles: ['Admin']
  },
  fileDelete: {
    roles: ['Admin']
  }
});
