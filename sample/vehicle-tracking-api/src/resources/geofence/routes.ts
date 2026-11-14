import { createRoutes } from '@appweaver/web';
import { Role } from '@/features/access/roles';

export default createRoutes({
  modelName: 'Geofence',
  path: '/geofences',
  find: {
    roles: [Role.Admin, Role.Dispatcher, Role.Driver]
  },
  query: {
    roles: [Role.Admin, Role.Dispatcher, Role.Driver]
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
  }
});
