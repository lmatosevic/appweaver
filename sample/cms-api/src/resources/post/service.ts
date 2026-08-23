import { createService, injectService } from '@appweaver/core';
import { logger } from '@appweaver/common';
import { Post, PostCreate, PostResourceService, PostUpdate } from '@/types';

export default createService<Post, PostCreate, PostUpdate>({
  modelName: 'Post',
  beforeUpdate: (_, data: PostUpdate) => {
    if (data.status === 'Published' && !data.publishedAt) {
      data.publishedAt = new Date();
    }
  },
  // Not part of the update input, so raised through the client
  afterFind: async (post: Post) => {
    try {
      await injectService<PostResourceService>('Post').client.update({
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
        contains: '{input}',
        mode: 'insensitive'
      },
      excerpt: {
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
