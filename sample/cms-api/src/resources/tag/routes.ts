import { createRoutes } from '@appweaver/web';

export default createRoutes({
  modelName: 'Tag',
  path: '/tags',
  find: {
    public: true,
    cache: { ttl: 60_000 }
  },
  query: {
    public: true,
    cache: { ttl: 60_000 },
    method: 'get'
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
  },
  // The bulk routes are disabled by default, `exclude: false` enables them.
  // They inherit the config of their single route (update and delete: Admin)
  bulkCreate: {
    exclude: false,
    roles: ['Admin']
  },
  bulkUpdate: {
    exclude: false,
    maxItems: 50
  },
  bulkDelete: {
    exclude: false
  },
  mcp: {
    description: 'The tags of the posts, matched by their slug.',
    actions: ['find', 'query', 'create']
  }
});
