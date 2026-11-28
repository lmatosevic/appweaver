import { createRoutes } from '@appweaver/web';

export default createRoutes({
  modelName: 'Page',
  path: '/pages',
  // The cache options apply only to the read routes
  defaults: {
    roles: ['Admin'],
    cache: { ttl: 300_000 }
  },
  find: {
    public: true
  },
  query: {
    public: true
  },
  aggregate: {
    exclude: true
  }
});
