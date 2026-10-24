import { createService } from '@appweaver/data';

export default createService({
  modelName: 'Person',
  textSearch: {
    name: {
      contains: '{input}'
    }
  }
});
