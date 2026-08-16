import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'Comment',
  path: '/comments',
  find: {
    public: true
  },
  query: {
    public: true
  }
});
