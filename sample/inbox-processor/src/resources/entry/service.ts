import { createService } from '@appweaver/data';

export default createService({
  modelName: 'Entry',
  textSearch: {
    text: { contains: '{input}' }
  }
});
