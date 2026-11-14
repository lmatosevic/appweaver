import { createRoutes } from '@appweaver/web';
import { Role } from '@/features/access/roles';

// Raised by the telemetry, and closed through the acknowledge route
export default createRoutes({
  modelName: 'Alert',
  path: '/alerts',
  find: {
    roles: [Role.Admin, Role.Dispatcher]
  },
  query: {
    roles: [Role.Admin, Role.Dispatcher]
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
