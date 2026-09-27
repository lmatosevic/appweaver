import { createRoutes } from '@appweaver/core';
import { Role } from '@/features/access/roles';

export default createRoutes({
  modelName: 'Brand',
  path: '/brands',
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
    roles: [Role.Admin]
  },
  update: {
    roles: [Role.Admin]
  },
  delete: {
    roles: [Role.Admin]
  },
  export: {
    exclude: true
  },
  fileUpload: {
    roles: [Role.Admin]
  },
  fileDelete: {
    roles: [Role.Admin]
  }
});
