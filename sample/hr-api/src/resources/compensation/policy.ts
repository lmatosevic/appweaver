import { createPolicy } from '@appweaver/core';
import { can, Permission } from '@/features/access/permissions';

export default createPolicy({
  modelName: 'Compensation',
  readRestrictions: (user) =>
    !user || can(user, Permission.PayrollRead) ? {} : { employeeId: user.id }
});
