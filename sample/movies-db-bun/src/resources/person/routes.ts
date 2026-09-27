import { createRoutes } from '@appweaver/core';
import { catalogEditors } from '@/features/access/roles';

export default createRoutes({
  modelName: 'Person',
  path: '/people',
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
    roles: catalogEditors
  },
  fileUpload: {
    roles: catalogEditors
  },
  fileDelete: {
    roles: catalogEditors
  }
});
