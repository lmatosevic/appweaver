import { createPolicy, HttpError } from '@appweaver/core';
import { can, Permission } from '@/features/access/permissions';

// The fields shaping the organization, changed by HR only
const managedFields = [
  'roles',
  'department',
  'position',
  'manager',
  'employmentType',
  'status',
  'hireDate',
  'enabled'
];

export default createPolicy({
  modelName: 'Employee',
  writeRestrictions: (user, data, action) => {
    if (!user || can(user, Permission.EmployeeManage)) {
      return null;
    }

    if (action === 'update' && data.id !== user.id) {
      throw new HttpError('Only the own profile can be changed', 403);
    }

    const changed = managedFields.filter((field) => data[field] !== undefined);
    if (changed.length > 0) {
      throw new HttpError(`Only HR can change: ${changed.join(', ')}`, 403);
    }

    return null;
  },
  files: {
    avatar: {
      canCreate: (user, employee) =>
        employee.id === user?.id || can(user, Permission.EmployeeManage),
      canDelete: (user, employee) =>
        employee.id === user?.id || can(user, Permission.EmployeeManage)
    }
  }
});
