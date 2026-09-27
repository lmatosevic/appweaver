import { AuthUser } from '@appweaver/common';
import { createPolicy } from '@appweaver/core';
import { can, Permission } from '@/features/access/permissions';
import { teamRestriction } from '@/features/access/team-restriction';

// Policies receive the database record, which holds the foreign key columns
type LeaveRequestRecord = { employeeId: string | null; status: string };

const ownerOrLeaveManager = (user: AuthUser, request: LeaveRequestRecord) =>
  request.employeeId === user?.id || can(user, Permission.LeaveManage);

export default createPolicy<LeaveRequestRecord>({
  modelName: 'LeaveRequest',
  readRestrictions: (user) => teamRestriction(user),
  // Filed for the signed-in employee, only leave managers file for others
  writeRestrictions: (user, _, action) =>
    user && action === 'create' && !can(user, Permission.LeaveManage)
      ? { employee: user.id }
      : null,
  // A decided request is changed through the decision routes only
  checkAccess: (user, request, action) =>
    action !== 'update' ||
    !user ||
    can(user, Permission.LeaveManage) ||
    (request.employeeId === user.id && request.status === 'Pending'),
  // A doctor's note is personal data, kept from the manager
  files: {
    attachment: {
      canAccess: ownerOrLeaveManager,
      canCreate: ownerOrLeaveManager,
      canDelete: ownerOrLeaveManager
    }
  }
});
