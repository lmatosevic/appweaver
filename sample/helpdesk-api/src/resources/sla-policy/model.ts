import { createModel } from '@appweaver/core';

/** The response and resolution targets of one ticket priority. */
export default createModel({
  name: 'SlaPolicy',
  scalars: {
    priority: {
      type: 'enum',
      values: ['Low', 'Normal', 'High', 'Urgent'],
      unique: true
    },
    firstResponseMinutes: {
      type: 'int',
      minimum: 1,
      example: 240
    },
    resolutionMinutes: {
      type: 'int',
      minimum: 1,
      example: 2880
    }
  }
});
