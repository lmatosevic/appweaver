import { createService } from '@appweaver/data';

export default createService({
  modelName: 'Department',
  textSearch: {
    OR: {
      name: {
        contains: '{input}'
      },
      code: {
        contains: '{input}'
      }
    }
  }
});
