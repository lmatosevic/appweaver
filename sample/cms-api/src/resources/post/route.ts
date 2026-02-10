import { ResourceRoute } from '@appweaver/common';

export default {
  name: 'Post',
  path: '/posts',
  find: {
    exclude: false,
    public: false,
    roles: ['admin', 'user'],
    auth: ['authenticateJWT']
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
} satisfies ResourceRoute;
