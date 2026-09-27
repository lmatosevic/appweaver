import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Page',
  textSearch: {
    OR: {
      title: {
        contains: '{input}'
      },
      content: {
        contains: '{input}'
      }
    }
  }
});
