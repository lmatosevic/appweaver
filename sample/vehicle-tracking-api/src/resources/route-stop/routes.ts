import { createRoutes } from '@appweaver/web';
import { Role } from '@/features/access/roles';

export default createRoutes({
  modelName: 'RouteStop',
  path: '/route-stops',
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
    roles: [Role.Admin, Role.Dispatcher]
  },
  update: {
    roles: [Role.Admin, Role.Dispatcher]
  },
  delete: {
    roles: [Role.Admin, Role.Dispatcher]
  },
  export: {
    exclude: true
  }
});
