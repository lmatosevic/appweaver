import { createService, HttpError } from '@appweaver/core';

export default createService({
  modelName: 'SlaPolicy',
  beforeCreate: (data) => assertTargets(data),
  beforeUpdate: (_, data) => assertTargets(data)
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
