import { createService } from '@appweaver/data';

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
