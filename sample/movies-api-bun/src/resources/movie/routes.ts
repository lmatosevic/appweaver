import { createRoutes } from '@appweaver/web';
import { catalogEditors, Role } from '@/features/access/roles';

// A read heavy public catalog: cached reads, edited by curators only
export default createRoutes({
  modelName: 'Movie',
  path: '/movies',
  find: {
    public: true,
    cache: { ttl: 300_000 }
  },
  query: {
    public: true,
    cache: { ttl: 60_000 },
    rateLimit: {
      max: 120,
      timeWindow: '1 minute'
    }
  },
  aggregate: {
    public: true,
    cache: { ttl: 300_000 }
  },
  create: {
    roles: catalogEditors
  },
  update: {
    roles: catalogEditors
  },
  delete: {
    roles: [Role.Admin]
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
