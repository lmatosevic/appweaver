import { AuthUser } from '@appweaver/common';
import { hasPermission } from '@appweaver/core';

/**
 * The permissions the routes and policies check. Roles only group them (see
 * the roles seeder), so a new role needs no code change.
 */
export const Permission = {
  /** Hire, update, and remove employees, departments, and positions */
  EmployeeManage: 'employee:manage',
  /** Approve or reject the leave requests of direct reports */
  LeaveApprove: 'leave:approve',
  /** See and change every leave request and balance */
  LeaveManage: 'leave:manage',
  /** Upload and read every employee document */
  DocumentManage: 'document:manage',
  /** Read every salary, and the payroll reports */
  PayrollRead: 'payroll:read',
  /** Change salaries */
  PayrollWrite: 'payroll:write',
  /** Write reviews of direct reports */
  ReviewWrite: 'review:write',
  /** See and change every review */
  ReviewManage: 'review:manage'
} as const;

export type PermissionName = (typeof Permission)[keyof typeof Permission];

/** Whether the user holds the permission, false for an anonymous caller. */
export function can(
  user: AuthUser | null | undefined,
  permission: PermissionName
): boolean {
  return !!user && hasPermission(user, permission);
}
