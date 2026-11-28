import { createRoutes } from '@appweaver/web';

export default createRoutes({
  modelName: 'User',
  find: {
    cache: { ttl: 30000 }
  },
  query: {
    cache: true,
    method: 'get-post'
  }
});
