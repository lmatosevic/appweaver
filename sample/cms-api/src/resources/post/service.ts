import { createService } from '@appweaver/data';

export default createService({
  modelName: 'Post',
  beforeUpdate: (_, data) => {
    if (data.status === 'Published' && !data.publishedAt) {
      data.publishedAt = new Date();
    }
  },
  textSearch: {
    OR: {
      title: {
        contains: '{input}'
      },
      excerpt: {
        contains: '{input}'
      },
      content: {
        contains: '{input}'
      }
    }
  }
});
