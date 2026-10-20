import { createService } from '@appweaver/data';

export default createService({
  modelName: 'Comment',
  textSearch: {
    body: {
      contains: '{input}'
    }
  }
});
