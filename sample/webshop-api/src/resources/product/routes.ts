import { createRoutes } from '@appweaver/core';
import { Role } from '@/features/access/roles';

// The storefront reads the catalog without an account, admins run it
export default createRoutes({
  modelName: 'Product',
  path: '/products',
  find: {
    public: true,
    cacheTTL: 60_000
  },
  query: {
    public: true,
    cacheTTL: 60_000
  },
  aggregate: {
    roles: [Role.Admin]
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
    roles: [Role.Admin]
  },
  fileUpload: {
    roles: [Role.Admin]
  },
  fileDelete: {
    roles: [Role.Admin]
  }
});
