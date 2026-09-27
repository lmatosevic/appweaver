import { createService, currentAuthUser, HttpError } from '@appweaver/core';
import db from '@db/client';
import {
  PerformanceReview,
  PerformanceReviewCreate,
  PerformanceReviewUpdate
} from '@/types';
import { can, Permission } from '@/features/access/permissions';

export default createService<
  PerformanceReview,
  PerformanceReviewCreate,
  PerformanceReviewUpdate
>({
  modelName: 'PerformanceReview',
  // Managers review their direct reports, review managers anyone
  beforeCreate: async (data) => {
    const user = currentAuthUser();
    if (!user || can(user, Permission.ReviewManage)) {
      return;
    }

    const employeeId =
      typeof data.employee === 'object' ? data.employee.id : data.employee;
    const employee = await db.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { managerId: true }
    });
    if (employee?.managerId !== user.id) {
      throw new HttpError('Only direct reports can be reviewed', 403);
    }
  }
});
