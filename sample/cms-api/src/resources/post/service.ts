import { createService } from '@appweaver/core';

export default createService({
  modelName: 'Post',
  beforeFind: (id: number) => {
    console.log('Finding post with ID:', id);
  },
  afterFind: (resource: any) => {
    console.log('Found resource:', resource);
  },
  textSearch: {
    OR: {
      title: {
        contains: '{input}',
        mode: 'insensitive'
      },
      content: {
        contains: '{input}',
        mode: 'insensitive'
      }
    }
  }
});
