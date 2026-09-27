import { createRoutes } from '@appweaver/core';
import { catalogEditors } from '@/features/access/roles';

export default createRoutes({
  modelName: 'Credit',
  path: '/credits',
  find: {
    public: true,
    cacheTTL: 600_000
  },
  query: {
    public: true,
    cacheTTL: 600_000
  },
  aggregate: {
    exclude: true
  },
  create: {
    roles: catalogEditors
  },
  update: {
    roles: catalogEditors
  },
  delete: {
    roles: catalogEditors
  },
  export: {
    exclude: true
  }
});
