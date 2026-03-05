import { createRoutes } from '@appweaver/core';

export default createRoutes({
  modelName: 'User',
  find: {
    cacheTTL: 30000
  },
  query: {
    cache: true
  }
});
