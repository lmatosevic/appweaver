import { keepsTable } from '../../database/database-config';
import { auditConfig, auditRoutesConfig } from '../audit-config';

/** Whether the framework serves the audit log: its routes, and the service and the policy of its models. */
export function auditRoutesEnabled(): boolean {
  return (
    auditRoutesConfig.ENABLED && (auditConfig.ENABLED || keepsTable('AuditLog'))
  );
}
