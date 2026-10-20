import { createService } from '@appweaver/data';

export default createService({
  modelName: 'Order',
  textSearch: {
    number: {
      contains: '{input}',
      mode: 'insensitive'
    }
  }
});
