import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Person',
  textSearch: {
    name: {
      contains: '{input}'
    }
  }
});
