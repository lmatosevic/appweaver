import { createRoutes } from '@appweaver/web';
import { Role } from '@/features/access/roles';

export default createRoutes({
  modelName: 'Route',
  path: '/routes',
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
    roles: [Role.Admin]
  },
  export: {
    exclude: true
  }
});
