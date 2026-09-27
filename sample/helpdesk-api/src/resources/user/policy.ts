import { createPolicy, hasRole, HttpError } from '@appweaver/core';
import { Role } from '@/features/access/roles';

export default createPolicy({
  modelName: 'User',
  writeRestrictions: (user, data, action) => {
    if (!user || action === 'create' || hasRole(user, Role.Admin)) {
      return null;
    }

    if (data.id !== user.id) {
      throw new HttpError('Only the own profile can be changed', 403);
    }
    // Agents set their availability, an admin their team and roles
    if (
      data.roles !== undefined ||
      data.team !== undefined ||
      data.enabled !== undefined
    ) {
      throw new HttpError('Roles and teams are assigned by an admin', 403);
    }

    return null;
  }
});
