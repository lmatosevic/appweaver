import { createPolicy } from '@appweaver/core';
import { teamRestriction } from '@/features/access/team-restriction';

export default createPolicy({
  modelName: 'LeaveBalance',
  readRestrictions: (user) => teamRestriction(user)
});
