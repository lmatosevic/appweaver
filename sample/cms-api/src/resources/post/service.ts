import { ResourceService } from '@appweaver/common';

export default {
  name: 'Post', // optional (default: folder path from path.join(cwd, ../)
  beforeFind: () => null,
  beforeQuery: () => null,
  beforeAggregate: () => null,
  beforeCreate: () => null,
  beforeUpdate: () => null,
  beforeDelete: () => null,
  afterFind: () => null,
  afterQuery: () => null,
  afterAggregate: () => null,
  afterCreate: () => null,
  afterUpdate: () => null,
  afterDelete: () => null,
  textSearch: {
    // it can also be a function (input) => ({ title: `User: ${input}` })
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
} satisfies ResourceService;
