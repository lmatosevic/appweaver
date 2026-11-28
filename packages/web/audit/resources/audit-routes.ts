import { auditRoutesConfig, auditRoutesEnabled } from '@appweaver/data';
import { createRoutes } from '../../factory/create-routes';

/** The read-only routes of a model of the audit log, for the roles of `audit.routes`. */
function auditRoutes(modelName: 'AuditLog' | 'AuditChange') {
  return createRoutes({
    modelName,
    defaults: {
      roles: auditRoutesConfig.ROLES,
      // Reading the audit log is not recorded in it
      audit: false
    },
    create: { exclude: true },
    update: { exclude: true },
    replace: { exclude: true },
    delete: { exclude: true },
    aggregate: { exclude: true },
    export: { exclude: true },
    bulkCreate: { exclude: true },
    bulkUpdate: { exclude: true },
    bulkReplace: { exclude: true },
    bulkDelete: { exclude: true }
  });
}

export const auditLogRoutes = auditRoutesEnabled()
  ? auditRoutes('AuditLog')
  : undefined;

export const auditChangeRoutes = auditRoutesEnabled()
  ? auditRoutes('AuditChange')
  : undefined;
