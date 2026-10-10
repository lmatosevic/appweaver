import { ErrorCode } from '@appweaver/common';
import { createPolicy, hasRole, ResourceError } from '@appweaver/core';
import { Role } from '@/features/access/roles';

export default createPolicy({
  modelName: 'User',
  writeRestrictions: (user, data, action) => {
    if (!user || hasRole(user, Role.Admin) || action === 'create') {
      return null;
    }

    if (data.id !== user.id) {
      throw new ResourceError(
        ErrorCode.ResourceForbidden,
        'Only the own profile can be changed',
        { model: 'User', action }
      );
    }
    if (data.roles !== undefined || data.enabled !== undefined) {
      throw new ResourceError(
        ErrorCode.ResourceForbidden,
        'Roles are assigned by an admin',
        { model: 'User', action }
      );
    }

    return null;
  },
  files: {
    avatar: {
      accessType: 'public'
    }
  }
});
