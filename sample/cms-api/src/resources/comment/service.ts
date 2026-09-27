import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Comment',
  textSearch: {
    body: {
      contains: '{input}'
    }
  }
});
