import { createService } from '@appweaver/data';

export default createService({
  modelName: 'Tag',
  textSearch: {
    name: {
      contains: '{input}'
    }
  }
});
