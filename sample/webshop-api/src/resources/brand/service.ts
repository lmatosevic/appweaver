import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Brand',
  textSearch: {
    name: {
      contains: '{input}',
      mode: 'insensitive'
    }
  }
});
