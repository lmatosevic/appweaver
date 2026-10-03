import { createModel } from '@appweaver/core';

export default createModel({
  name: 'PerformanceReview',
  // Soft deleted together with the employee
  softDelete: true,
  scalars: {
    period: {
      type: 'string',
      pattern: '^\\d{4}-H[12]$',
      example: '2026-H1'
    },
    rating: {
      type: 'int',
      minimum: 1,
      maximum: 5,
      example: 4
    },
    strengths: {
      type: 'string',
      required: false,
      maxLength: 4000
    },
    improvements: {
      type: 'string',
      required: false,
      maxLength: 4000
    },
    // Free-form list, i.e. [{ "title": "Lead the migration", "done": false }]
    goals: {
      type: 'json',
      required: false
    },
    // Hidden from the employee until it is shared with them
    status: {
      type: 'enum',
      values: ['Draft', 'Shared'],
      default: 'Draft'
    }
  },
  relations: {
    employee: {
      model: 'Employee',
      type: 'manyToOne',
      mappedBy: 'reviews',
      onDelete: 'cascade',
      output: {
        type: 'always'
      }
    },
    // Set to the signed-in reviewer
    reviewer: {
      model: 'Employee',
      type: 'manyToOne',
      mappedBy: 'writtenReviews',
      required: false,
      input: {
        type: 'none'
      },
      output: {
        type: 'always'
      }
    }
  },
  unique: [['employeeId', 'period']]
});
