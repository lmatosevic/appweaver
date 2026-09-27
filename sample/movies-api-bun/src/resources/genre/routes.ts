import { createRoutes } from '@appweaver/core';
import { catalogEditors } from '@/features/access/roles';

export default createRoutes({
  modelName: 'Genre',
  path: '/genres',
  find: {
    public: true,
    cacheTTL: 3_600_000
  },
  query: {
    public: true,
    cacheTTL: 3_600_000
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
