import { ErrorCode, RequestError } from '@appweaver/common';
import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Position',
  beforeCreate: (data) => assertSalaryBand(data),
  beforeUpdate: (_, data) => assertSalaryBand(data),
  textSearch: {
    title: {
      contains: '{input}'
    }
  }
});

function assertSalaryBand(data: { salaryMin?: number; salaryMax?: number }) {
  if (
    data.salaryMin !== undefined &&
    data.salaryMax !== undefined &&
    data.salaryMin > data.salaryMax
  ) {
    throw new RequestError(
      ErrorCode.ValidationFailed,
      'salaryMin cannot exceed salaryMax',
      {
        errors: [
          {
            field: 'salaryMin',
            rule: 'max',
            message: 'cannot exceed salaryMax'
          }
        ]
      }
    );
  }
}
