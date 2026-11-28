import { createRoutes } from '@appweaver/web';
import { catalogEditors } from '@/features/access/roles';

export default createRoutes({
  modelName: 'Genre',
  path: '/genres',
  find: {
    public: true,
    cache: { ttl: 3_600_000 }
  },
  query: {
    public: true,
    cache: { ttl: 3_600_000 }
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
