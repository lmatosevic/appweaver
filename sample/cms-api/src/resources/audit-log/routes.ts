import { createRoutes } from '@appweaver/web';

// The requests of the API, each found with its changes, read by the admins only
export default createRoutes({
  modelName: 'AuditLog',
  defaults: {
    roles: ['Admin'],
    // Reading the audit log is not recorded in it
    audit: false
  },
  create: { exclude: true },
  update: { exclude: true },
  delete: { exclude: true },
  export: { exclude: true }
});
