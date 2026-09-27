import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Product',
  textSearch: {
    OR: {
      name: {
        contains: '{input}',
        mode: 'insensitive'
      },
      description: {
        contains: '{input}',
        mode: 'insensitive'
      },
      sku: {
        startsWith: '{input}',
        mode: 'insensitive'
      }
    }
  }
});
