import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Order',
  textSearch: {
    number: {
      contains: '{input}',
      mode: 'insensitive'
    }
  }
});
