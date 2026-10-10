import {
  ApplicationError,
  ErrorCode,
  RequestError,
  ResourceId
} from '@appweaver/common';
import { createService, currentAuthUser } from '@appweaver/core';
import db from '@db/client';
import { LeaveRequestCreate, LeaveRequestUpdate } from '@/types';
import { countWorkingDays } from '@/features/leave/working-days';
import { HrErrors } from '@/errors';

type Days = { days?: number };

export default createService({
  modelName: 'LeaveRequest',
  beforeCreate: async (data: LeaveRequestCreate & Days) => {
    const employee = data.employee ?? currentAuthUser()?.id;
    const employeeId = typeof employee === 'object' ? employee.id : employee;

    data.days = await validatePeriod(
      String(employeeId),
      new Date(data.startDate),
      new Date(data.endDate)
    );
  },
  // Changing the dates counts the days again
  beforeUpdate: async (id: ResourceId, data: LeaveRequestUpdate & Days) => {
    if (data.startDate === undefined && data.endDate === undefined) {
      return;
    }

    const current = await db.leaveRequest.findFirst({
      where: { id: Number(id), deletedAt: null }
    });
    if (!current) {
      return;
    }

    data.days = await validatePeriod(
      current.employeeId!,
      new Date(data.startDate ?? current.startDate),
      new Date(data.endDate ?? current.endDate),
      current.id
    );
  },
  textSearch: {
    reason: {
      contains: '{input}'
    }
  }
});

/**
 * Checks the period holds working days and does not overlap another pending
 * or approved request of the employee, returning its working days.
 */
async function validatePeriod(
  employeeId: string,
  startDate: Date,
  endDate: Date,
  excludeId?: number
): Promise<number> {
  if (endDate < startDate) {
    throw new RequestError(
      ErrorCode.ValidationFailed,
      'endDate cannot be before startDate',
      {
        errors: [
          {
            field: 'endDate',
            rule: 'min',
            message: 'cannot be before startDate'
          }
        ]
      }
    );
  }

  const days = countWorkingDays(startDate, endDate);
  if (days === 0) {
    throw new RequestError(
      ErrorCode.ValidationFailed,
      'The period holds no working days',
      {
        errors: [
          {
            field: 'endDate',
            rule: 'workingDays',
            message: 'must close a period holding working days'
          }
        ]
      }
    );
  }

  const overlapping = await db.leaveRequest.findFirst({
    where: {
      employeeId,
      id: excludeId ? { not: excludeId } : undefined,
      deletedAt: null,
      status: { in: ['Pending', 'Approved'] },
      startDate: { lte: endDate },
      endDate: { gte: startDate }
    }
  });
  if (overlapping) {
    throw new ApplicationError(
      HrErrors.LeaveOverlap,
      `Overlaps the ${overlapping.status.toLowerCase()} leave request ${overlapping.id}`,
      { leaveRequestId: overlapping.id }
    );
  }

  return days;
}
