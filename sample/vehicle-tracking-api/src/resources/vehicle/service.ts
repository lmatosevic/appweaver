import { createService } from '@appweaver/data';

export default createService({
  modelName: 'Vehicle',
  textSearch: {
    OR: {
      name: {
        contains: '{input}',
        mode: 'insensitive'
      },
      plate: {
        contains: '{input}',
        mode: 'insensitive'
      }
    }
  }
});
