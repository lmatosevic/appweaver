import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'Post',
  path: '/posts',
  find: {
    public: true,
    cacheTTL: 60_000
  },
  query: {
    public: true,
    cacheTTL: 60_000
  },
  aggregate: {
    roles: ['Admin']
  },
  create: {
    roles: ['Admin', 'User']
  },
  update: {
    roles: ['Admin', 'User']
  },
  delete: {
    roles: ['Admin']
  },
  export: {
    roles: ['Admin']
  },
  fileUpload: {
    roles: ['Admin', 'User']
  },
  fileDelete: {
    roles: ['Admin', 'User'],
    recaptcha: true,
    recaptchaAction: 'delete-post-file'
  }
});
