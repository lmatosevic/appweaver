import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Movie',
  textSearch: {
    OR: {
      title: {
        contains: '{input}'
      },
      originalTitle: {
        contains: '{input}'
      },
      tagline: {
        contains: '{input}'
      }
    }
  }
});
