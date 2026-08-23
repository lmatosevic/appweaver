import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Tag',
  textSearch: {
    name: {
      contains: '{input}',
      mode: 'insensitive'
    }
  }
});
