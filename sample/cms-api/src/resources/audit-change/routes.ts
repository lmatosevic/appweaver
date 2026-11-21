import { createRoutes } from '@appweaver/web';

// The history of a record, queried by its `model` and `resourceId`, each change with its request
export default createRoutes({
  modelName: 'AuditChange',
  defaults: {
    roles: ['Admin'],
    audit: false
  },
  create: { exclude: true },
  update: { exclude: true },
  delete: { exclude: true },
  export: { exclude: true },
  aggregate: { exclude: true }
});
