import { createPolicy } from '../../../factory/create-policy';
import { auditRoutesEnabled } from '../../utils/audit-routes-util';

// Written by the AuditService only, so the services never change an entry
export default auditRoutesEnabled()
  ? createPolicy({
      modelName: 'AuditLog',
      checkAccess: (_user, _resource, action) =>
        action !== 'create' && action !== 'update' && action !== 'delete'
    })
  : undefined;
