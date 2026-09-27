import { createService, HttpError } from '@appweaver/core';
import { SlaPolicyCreate, SlaPolicyUpdate } from '@/types';

export default createService({
  modelName: 'SlaPolicy',
  beforeCreate: (data: SlaPolicyCreate) => assertTargets(data),
  beforeUpdate: (_, data: SlaPolicyUpdate) => assertTargets(data)
});

// A ticket cannot be resolved before it is answered
function assertTargets(data: {
  firstResponseMinutes?: number;
  resolutionMinutes?: number;
}): void {
  if (
    data.firstResponseMinutes !== undefined &&
    data.resolutionMinutes !== undefined &&
    data.firstResponseMinutes > data.resolutionMinutes
  ) {
    throw new HttpError(
      'firstResponseMinutes cannot exceed resolutionMinutes',
      400
    );
  }
}
