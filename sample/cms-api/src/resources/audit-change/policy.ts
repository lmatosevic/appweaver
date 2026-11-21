import { createPolicy } from '@appweaver/data';

// Append-only: the AuditService writes the audit log and its retention deletes it
export default createPolicy({
  modelName: 'AuditChange',
  checkAccess: (_user, _resource, action) =>
    action !== 'create' && action !== 'update' && action !== 'delete'
});
