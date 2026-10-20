import { createPolicy } from '@appweaver/data';
import { can, Permission } from '@/features/access/permissions';

export default createPolicy({
  modelName: 'EmployeeDocument',
  readRestrictions: (user) =>
    !user || can(user, Permission.DocumentManage)
      ? {}
      : { employeeId: user.id },
  files: {
    file: {
      canAccess: (user, document) =>
        document.employeeId === user?.id || can(user, Permission.DocumentManage)
    }
  }
});
