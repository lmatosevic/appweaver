import { AuthUser } from '@appweaver/common';
import { HttpError, injectService } from '@appweaver/core';
import db from '@db/client';
import { LeaveRequestSingle } from '@/types';
import { can, Permission } from '@/features/access/permissions';
import { notifyLeaveDecision } from './leave-notifications';

type Decision = 'Approved' | 'Rejected';

/**
 * Approves or rejects a pending request. A manager decides for their direct
 * reports, a leave manager for anyone, and nobody for themselves. An approved
 * annual leave is booked against the balance of the year it starts in.
 */
export async function decideLeaveRequest(
  id: number,
  decision: Decision,
  decider: AuthUser,
  note?: string
): Promise<LeaveRequestSingle> {
  const decided = await db.$transaction(async (tx) => {
    const request = await tx.leaveRequest.findFirst({
      where: { id, deletedAt: null },
      include: { employee: true }
    });
    if (!request?.employee) {
      throw new HttpError('Leave request not found', 404);
    }

    const { employee } = request;
    if (employee.id === decider.id) {
      throw new HttpError(
        'Own leave requests are decided by someone else',
        403
      );
    }
    if (
      employee.managerId !== decider.id &&
      !can(decider, Permission.LeaveManage)
    ) {
      throw new HttpError('Only the manager of the employee can decide', 403);
    }
    if (request.status !== 'Pending') {
      throw new HttpError(`Leave request is already ${request.status}`, 409);
    }

    if (decision === 'Approved' && request.type === 'Annual') {
      const year = request.startDate.getUTCFullYear();
      const balance = await tx.leaveBalance.findFirst({
        where: { employeeId: employee.id, year, deletedAt: null }
      });
      if (!balance) {
        throw new HttpError(`No leave balance for ${year}`, 409);
      }

      const remaining =
        balance.allowanceDays + balance.carriedOverDays - balance.usedDays;
      if (request.days > remaining) {
        throw new HttpError(
          `Not enough leave days: ${request.days} requested, ${remaining} remaining`,
          409
        );
      }

      await tx.leaveBalance.update({
        where: { id: balance.id },
        data: { usedDays: { increment: request.days } }
      });
    }

    return tx.leaveRequest.update({
      where: { id },
      data: {
        status: decision,
        decidedAt: new Date(),
        decidedById: String(decider.id),
        decisionNote: note ?? null
      },
      include: { employee: true }
    });
  });

  await notifyLeaveDecision(decided.employee!, decided);

  return injectService('LeaveRequest').find(id);
}

/**
 * Withdraws a request that is still pending, or an approved one that has not
 * started yet, giving the booked days back to the balance.
 */
export async function cancelLeaveRequest(
  id: number,
  user: AuthUser
): Promise<LeaveRequestSingle> {
  await db.$transaction(async (tx) => {
    const request = await tx.leaveRequest.findFirst({
      where: { id, deletedAt: null }
    });
    if (!request) {
      throw new HttpError('Leave request not found', 404);
    }
    if (request.employeeId !== user.id && !can(user, Permission.LeaveManage)) {
      throw new HttpError('Only the employee can cancel the request', 403);
    }

    const cancellable =
      request.status === 'Pending' ||
      (request.status === 'Approved' && request.startDate > new Date());
    if (!cancellable) {
      throw new HttpError(
        `A ${request.status.toLowerCase()} leave request cannot be cancelled`,
        409
      );
    }

    if (request.status === 'Approved' && request.type === 'Annual') {
      await tx.leaveBalance.updateMany({
        where: {
          employeeId: request.employeeId ?? undefined,
          year: request.startDate.getUTCFullYear(),
          deletedAt: null
        },
        data: { usedDays: { decrement: request.days } }
      });
    }

    await tx.leaveRequest.update({
      where: { id },
      data: { status: 'Cancelled' }
    });
  });

  return injectService('LeaveRequest').find(id);
}
