import { createService, injectService } from '@appweaver/core';
import { logger } from '@appweaver/common';

export default createService({
  modelName: 'Post',
  beforeUpdate: (_, data) => {
    if (data.status === 'Published' && !data.publishedAt) {
      data.publishedAt = new Date();
    }
  },
  // Not part of the update input, so raised through the client
  afterFind: async (post) => {
    try {
      await injectService('Post').client.update({
        where: { id: post.id },
        data: { viewCount: { increment: 1 } }
      });
    } catch (e) {
      logger.warn(e, 'Post view count was not raised');
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
