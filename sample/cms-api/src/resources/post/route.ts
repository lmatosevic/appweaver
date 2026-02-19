import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'Post',
  path: '/posts',
  find: {
    exclude: false,
    public: false,
    roles: ['Admin', 'User']
  },
  query: {
    cacheTTL: 500
  },
  aggregate: {},
  create: {},
  update: {},
  delete: {
    exclude: true
  },
  export: {
    public: true
  },
  fileUpload: {},
  fileDelete: {}
});
