import { createModel } from '@appweaver/core';

/** A salary change, so the rows of an employee form their pay history. */
export default createModel({
  name: 'Compensation',
  // Soft deleted together with the employee
  softDelete: true,
  scalars: {
    baseSalary: {
      type: 'float',
      minimum: 0,
      example: 42000
    },
    currency: {
      type: 'enum',
      values: ['EUR', 'USD', 'GBP'],
      default: 'EUR'
    },
    bonusTargetPercent: {
      type: 'float',
      default: 0,
      minimum: 0,
      maximum: 100
    },
    reason: {
      type: 'enum',
      values: ['Hire', 'Promotion', 'Adjustment', 'Market'],
      default: 'Adjustment'
    },
    effectiveFrom: {
      type: 'dateTime',
      example: '2026-01-01T00:00:00.000Z'
    },
    notes: {
      type: 'string',
      required: false,
      maxLength: 1000
    }
  },
  relations: {
    employee: {
      model: 'Employee',
      type: 'oneToMany',
      mappedBy: 'compensations',
      owner: true,
      onDelete: 'cascade',
      output: {
        type: 'always'
      }
    }
  },
  export: {
    employee: {
      headerName: 'Employee',
      mapValue: 'employeeNumber'
    },
    effectiveFrom: {
      headerName: 'Effective from',
      mapValue: (value: Date) => new Date(value).toISOString().slice(0, 10)
    },
    notes: {
      exclude: true
    }
  },
  index: [['employeeId', '-effectiveFrom']]
});
