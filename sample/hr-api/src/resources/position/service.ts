import { createService, HttpError } from '@appweaver/core';
import { Position, PositionCreate, PositionUpdate } from '@/types';

export default createService<Position, PositionCreate, PositionUpdate>({
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
    throw new HttpError('salaryMin cannot exceed salaryMax', 400);
  }
}
