import { createPolicy, hasRole } from '@appweaver/data';
import { Role } from '@/features/access/roles';

// Drivers see the trips they drove, the staff all of them
export default createPolicy({
  modelName: 'Trip',
  readRestrictions: (user) =>
    user && hasRole(user, Role.Driver) && !hasRole(user, Role.Admin)
      ? { driverId: user.id }
      : {}
});
