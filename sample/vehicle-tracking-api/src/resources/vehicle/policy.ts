import { createPolicy, hasRole } from '@appweaver/data';
import { Role } from '@/features/access/roles';

// Drivers see the vehicles assigned to them, and their readings, the staff all
export default createPolicy({
  modelName: 'Vehicle',
  readRestrictions: (user) =>
    user && hasRole(user, Role.Driver) && !hasRole(user, Role.Admin)
      ? { driverId: user.id }
      : {}
});
