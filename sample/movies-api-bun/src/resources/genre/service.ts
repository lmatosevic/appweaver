import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Genre',
  textSearch: {
    name: {
      contains: '{input}'
    }
  }
});
