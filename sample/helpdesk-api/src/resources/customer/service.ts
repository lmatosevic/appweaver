import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Customer',
  textSearch: {
    OR: {
      name: {
        contains: '{input}'
      },
      email: {
        contains: '{input}'
      },
      company: {
        contains: '{input}'
      }
    }
  }
});
