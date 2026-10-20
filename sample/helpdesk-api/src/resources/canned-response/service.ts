import { createService } from '@appweaver/data';

export default createService({
  modelName: 'CannedResponse',
  textSearch: {
    OR: {
      title: {
        contains: '{input}'
      },
      body: {
        contains: '{input}'
      }
    }
  }
});
