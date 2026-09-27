import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Category',
  textSearch: {
    name: {
      contains: '{input}',
      mode: 'insensitive'
    }
  }
});
