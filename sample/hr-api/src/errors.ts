import { defineErrors } from '@appweaver/core';

/** The error codes of the HR API, returned as the `code` of its error responses. */
export const HrErrors = defineErrors({
  LeaveAlreadyDecided: {
    status: 409,
    title: 'Leave request already decided'
  },
  LeaveNotCancellable: {
    status: 409,
    title: 'Leave request not cancellable'
  },
  LeaveOverlap: { status: 409, title: 'Overlapping leave request' },
  LeaveBalanceMissing: { status: 409, title: 'Leave balance missing' },
  LeaveBalanceExceeded: { status: 409, title: 'Not enough leave days' }
});
