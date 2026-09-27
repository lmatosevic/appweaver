import { createModel } from '@appweaver/core';

export default createModel({
  name: 'LeaveRequest',
  // Soft deleted together with the employee
  softDelete: true,
  scalars: {
    type: {
      type: 'enum',
      values: ['Annual', 'Sick', 'Parental', 'Unpaid'],
      default: 'Annual'
    },
    startDate: {
      type: 'dateTime',
      example: '2026-07-06T00:00:00.000Z'
    },
    endDate: {
      type: 'dateTime',
      example: '2026-07-10T00:00:00.000Z'
    },
    // Working days between the two dates, counted by the service
    days: {
      type: 'int',
      minimum: 0,
      example: 5
    },
    reason: {
      type: 'string',
      required: false,
      maxLength: 1000
    },
    status: {
      type: 'enum',
      values: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      default: 'Pending'
    },
    decidedAt: {
      type: 'dateTime',
      required: false
    },
    decisionNote: {
      type: 'string',
      required: false,
      maxLength: 1000
    }
  },
  relations: {
    // Set to the signed-in employee unless an HR user files it for someone
    employee: {
      model: 'Employee',
      type: 'oneToMany',
      mappedBy: 'leaveRequests',
      owner: true,
      onDelete: 'cascade',
      required: false,
      output: {
        type: 'always'
      }
    },
    decidedBy: {
      model: 'Employee',
      type: 'oneToMany',
      mappedBy: 'decidedLeaveRequests',
      owner: true,
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'single'
      }
    }
  },
  files: {
    // i.e. the doctor's note of a sick leave
    attachment: {
      mimeType: '(application/pdf|image/(jpeg|png))',
      namePattern: 'leave/{year}/{resourceId}-{hash}.{extension}',
      maxSize: '5 MB'
    }
  },
  // The decision is taken through the approve and reject routes
  create: {
    omit: ['days', 'status', 'decidedAt', 'decisionNote']
  },
  update: {
    pick: ['type', 'startDate', 'endDate', 'reason']
  },
  index: [
    ['status', 'startDate'],
    ['employeeId', '-startDate']
  ]
});
