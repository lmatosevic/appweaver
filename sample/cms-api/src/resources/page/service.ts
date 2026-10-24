import { createService } from '@appweaver/data';

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
