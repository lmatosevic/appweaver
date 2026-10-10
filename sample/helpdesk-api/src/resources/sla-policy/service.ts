import { ErrorCode, RequestError } from '@appweaver/common';
import { createService } from '@appweaver/core';

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
    throw new RequestError(
      ErrorCode.ValidationFailed,
      'firstResponseMinutes cannot exceed resolutionMinutes',
      {
        errors: [
          {
            field: 'firstResponseMinutes',
            rule: 'max',
            message: 'cannot exceed resolutionMinutes'
          }
        ]
      }
    );
  }
}
