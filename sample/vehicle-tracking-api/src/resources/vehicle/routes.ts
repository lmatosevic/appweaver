import { createRoutes } from '@appweaver/web';
import { Role } from '@/features/access/roles';

// The admins run the fleet, the dispatchers assign the drivers and routes,
// the drivers see their own vehicles (see the policy)
export default createRoutes({
  modelName: 'Vehicle',
  path: '/vehicles',
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
    roles: [Role.Admin]
  },
  update: {
    roles: [Role.Admin, Role.Dispatcher]
  },
  delete: {
    roles: [Role.Admin]
  },
  export: {
    roles: [Role.Admin]
  },
  // The readings of the trackers, written by the telemetry route only
  seriesQuery: {
    roles: [Role.Admin, Role.Dispatcher, Role.Driver]
  },
  seriesWrite: {
    exclude: true
  },
  seriesDelete: {
    roles: [Role.Admin]
  }
});
