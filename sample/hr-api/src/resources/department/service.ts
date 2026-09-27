import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Department',
  textSearch: {
    OR: {
      name: {
        contains: '{input}'
      },
      code: {
        contains: '{input}'
      }
    }
  }
});
