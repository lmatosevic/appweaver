import { createRoutes } from '@appweaver/web';
import { Role, staff } from '@/features/access/roles';

export default createRoutes({
  modelName: 'Team',
  path: '/teams',
  find: {
    roles: staff,
    cacheTTL: 300_000
  },
  query: {
    roles: staff,
    cacheTTL: 300_000
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
  // The metrics dashboards of the staff, written by the metrics job only,
  // and cleared by an admin
  seriesQuery: {
    roles: staff
  },
  seriesWrite: {
    exclude: true
  },
  seriesDelete: {
    roles: [Role.Admin]
  }
});
