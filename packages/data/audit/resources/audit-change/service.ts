import { createService } from '../../../factory/create-service';
import { auditRoutesEnabled } from '../../utils/audit-routes-util';

export default auditRoutesEnabled()
  ? createService({ modelName: 'AuditChange' })
  : undefined;
