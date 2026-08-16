import { createService } from '@appweaver/core';
import { ResourceId, logger } from '@appweaver/common';

export default createService({
  modelName: 'Post',
  beforeFind: (id: ResourceId) => {
    logger.info({ id }, 'Finding post with ID:');
  },
  afterFind: (resource: any) => {
    logger.info({ resource }, 'Found post resource:');
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
