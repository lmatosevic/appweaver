import { createModel } from '@appweaver/core';

/** The annual leave days of an employee for one calendar year. */
export default createModel({
  name: 'LeaveBalance',
  // Soft deleted together with the employee
  softDelete: true,
  scalars: {
    year: {
      type: 'int',
      minimum: 2000,
      maximum: 2100,
      example: 2026
    },
    allowanceDays: {
      type: 'int',
      minimum: 0,
      maximum: 60,
      example: 24
    },
    carriedOverDays: {
      type: 'int',
      default: 0,
      minimum: 0
    },
    // Raised by an approved request, lowered by its cancellation
    usedDays: {
      type: 'int',
      default: 0,
      minimum: 0
    }
  },
  relations: {
    employee: {
      model: 'Employee',
      type: 'manyToOne',
      mappedBy: 'leaveBalances',
      onDelete: 'cascade',
      output: {
        type: 'multiple'
      }
    }
  },
  virtual: {
    remainingDays: {
      type: 'int',
      example: 17,
      input: {
        type: 'none'
      },
      output: {
        value: (balance: {
          allowanceDays: number;
          carriedOverDays: number;
          usedDays: number;
        }) => balance.allowanceDays + balance.carriedOverDays - balance.usedDays
      }
    }
  },
  update: {
    omit: ['usedDays']
  },
  create: {
    omit: ['usedDays']
  },
  // One balance per employee and year
  unique: [['employeeId', 'year']]
});
