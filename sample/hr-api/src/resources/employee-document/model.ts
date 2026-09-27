import { createModel } from '@appweaver/core';

export default createModel({
  name: 'EmployeeDocument',
  // Soft deleted together with the employee
  softDelete: true,
  scalars: {
    title: {
      type: 'string',
      minLength: 2,
      maxLength: 200,
      example: 'Employment contract'
    },
    category: {
      type: 'enum',
      values: ['Contract', 'Payslip', 'Certificate', 'Policy', 'Other'],
      default: 'Other'
    },
    validUntil: {
      type: 'dateTime',
      required: false
    }
  },
  relations: {
    employee: {
      model: 'Employee',
      type: 'oneToMany',
      mappedBy: 'documents',
      owner: true,
      onDelete: 'cascade',
      output: {
        type: 'always'
      }
    }
  },
  files: {
    file: {
      mimeType: '(application/pdf|image/(jpeg|png))',
      namePattern: 'documents/{year}/{resourceId}-{hash}.{extension}',
      maxSize: '10 MB',
      // Removed with the employee, since personal data must not outlive it
      onResourceSoftDeleted: 'delete'
    }
  },
  index: [['employeeId', 'category']]
});
