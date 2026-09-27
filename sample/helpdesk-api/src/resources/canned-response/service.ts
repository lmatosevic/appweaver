import { createService } from '@appweaver/core';

export default createService({
  modelName: 'CannedResponse',
  textSearch: {
    OR: {
      title: {
        contains: '{input}'
      },
      body: {
        contains: '{input}'
      }
    }
  }
});
