import { createService } from '@appweaver/data';

export default createService({
  modelName: 'Genre',
  textSearch: {
    name: {
      contains: '{input}'
    }
  }
});
