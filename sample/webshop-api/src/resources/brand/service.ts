import { createService } from '@appweaver/data';

export default createService({
  modelName: 'Brand',
  textSearch: {
    name: {
      contains: '{input}',
      mode: 'insensitive'
    }
  }
});
