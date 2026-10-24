import { createService } from '@appweaver/data';

export default createService({
  modelName: 'Category',
  textSearch: {
    name: {
      contains: '{input}',
      mode: 'insensitive'
    }
  }
});
