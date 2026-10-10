import { Type } from '@sinclair/typebox';
import { ErrorCode } from '@appweaver/common';
import {
  currentAuthUser,
  errorResponses,
  registerRoute
} from '@appweaver/core';
import { HrErrors } from '@/errors';
import { Permission } from '@/features/access/permissions';
import { cancelLeaveRequest, decideLeaveRequest } from './leave-decision';

const decisionErrors = errorResponses(
  ErrorCode.ResourceNotFound,
  ErrorCode.ResourceForbidden,
  HrErrors.LeaveAlreadyDecided,
  HrErrors.LeaveBalanceMissing,
  HrErrors.LeaveBalanceExceeded
);

const cancelErrors = errorResponses(
  ErrorCode.ResourceNotFound,
  ErrorCode.ResourceForbidden,
  HrErrors.LeaveNotCancellable
);

const params = Type.Object({ id: Type.Integer({ minimum: 1 }) });

// Deciding needs the permission, whether the decider may decide for this
// particular employee is checked against the reporting line
registerRoute(
  (router) => {
    router.post(
      '/leave-requests/:id/approve',
      {
        schema: {
          tags: ['LeaveRequest'],
          summary: 'Approve a pending leave request',
          description:
            'Books an annual leave against the balance of its year, and emails the employee.',
          params,
          body: Type.Object({
            note: Type.Optional(Type.String({ maxLength: 1000 }))
          }),
          response: {
            200: Type.Ref('LeaveRequestSingle'),
            ...decisionErrors
          }
        }
      },
      async (req) =>
        decideLeaveRequest(
          req.params.id,
          'Approved',
          currentAuthUser()!,
          req.body.note
        )
    );

    router.post(
      '/leave-requests/:id/reject',
      {
        schema: {
          tags: ['LeaveRequest'],
          summary: 'Reject a pending leave request',
          description: 'The reason is required, and emailed to the employee.',
          params,
          body: Type.Object({
            note: Type.String({ minLength: 3, maxLength: 1000 })
          }),
          response: {
            200: Type.Ref('LeaveRequestSingle'),
            ...decisionErrors
          }
        }
      },
      async (req) =>
        decideLeaveRequest(
          req.params.id,
          'Rejected',
          currentAuthUser()!,
          req.body.note
        )
    );
  },
  { permissions: [Permission.LeaveApprove, Permission.LeaveManage] }
);

registerRoute((router) => {
  router.post(
    '/leave-requests/:id/cancel',
    {
      schema: {
        tags: ['LeaveRequest'],
        summary: 'Cancel an own leave request',
        description:
          'A pending request, or an approved one that has not started yet. The booked days return to the balance.',
        params,
        response: {
          200: Type.Ref('LeaveRequestSingle'),
          ...cancelErrors
        }
      }
    },
    async (req) => cancelLeaveRequest(req.params.id, currentAuthUser()!)
  );
});
