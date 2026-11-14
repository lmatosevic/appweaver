import { createRoutes } from '@appweaver/web';
import { Role } from '@/features/access/roles';

// The trips are recorded by the telemetry, so the API only reads them
export default createRoutes({
  modelName: 'Trip',
  path: '/trips',
  find: {
    roles: [Role.Admin, Role.Dispatcher, Role.Driver]
  },
  query: {
    roles: [Role.Admin, Role.Dispatcher, Role.Driver]
  },
  aggregate: {
    roles: [Role.Admin, Role.Dispatcher]
  },
  create: {
    exclude: true
  },
  update: {
    exclude: true
  },
  delete: {
    roles: [Role.Admin]
  },
  export: {
    roles: [Role.Admin, Role.Dispatcher]
  }
});
