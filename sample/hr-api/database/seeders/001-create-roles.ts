import { db } from '@db/client';
import { Permission } from '@/features/access/permissions';

/** Roles group the permissions the routes and policies check. */
const roles: Record<string, string[]> = {
  Admin: Object.values(Permission),
  HR: [
    Permission.EmployeeManage,
    Permission.LeaveManage,
    Permission.LeaveApprove,
    Permission.DocumentManage,
    Permission.ReviewWrite,
    Permission.ReviewManage
  ],
  Payroll: [Permission.PayrollRead, Permission.PayrollWrite],
  Manager: [Permission.LeaveApprove, Permission.ReviewWrite],
  Employee: []
};

export async function createRoles(): Promise<void> {
  for (const [name, permissions] of Object.entries(roles)) {
    await db.role.create({
      data: {
        name,
        permissions: {
          connectOrCreate: permissions.map((permission) => ({
            where: { name: permission },
            create: { name: permission }
          }))
        }
      }
    });
  }
}
