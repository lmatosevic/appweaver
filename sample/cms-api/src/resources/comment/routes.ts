import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'Comment',
  path: '/comments',
  find: {
    public: true
  },
  query: {
    public: true
  },
  aggregate: {
    exclude: true
  },
  // Open to readers who are not signed in, so rate limited by IP
  create: {
    public: true,
    rateLimit: {
      max: 5,
      timeWindow: '1 minute'
    }
  },
  export: {
    roles: ['Admin']
  }
});
