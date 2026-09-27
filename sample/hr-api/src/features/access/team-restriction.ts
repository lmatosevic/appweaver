import { AuthUser } from '@appweaver/common';
import { can, Permission } from './permissions';

/**
 * The read filter of the records owned by an employee through the `employee`
 * relation: leave managers see everyone's, approvers their own and those of
 * their direct reports, anyone else only their own. Calls made outside of a
 * request, by jobs and seeders, are not restricted.
 */
export function teamRestriction(user: AuthUser | null): object {
  if (!user || can(user, Permission.LeaveManage)) {
    return {};
  }

  if (can(user, Permission.LeaveApprove)) {
    return {
      OR: [{ employeeId: user.id }, { employee: { managerId: user.id } }]
    };
  }

  return { employeeId: user.id };
}
