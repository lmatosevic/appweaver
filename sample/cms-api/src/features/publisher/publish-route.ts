import { Type } from '@sinclair/typebox';
import { registerModel, registerRoute } from '@appweaver/core';
import { Nullable } from '@appweaver/common';
import {
  latestPublishedPost,
  publishScheduledPosts
} from '@/features/publisher/publish';

registerRoute(
  (router) => {
    router.post(
      '/publish-posts',
      {
        schema: {
          tags: ['Posts'],
          summary: 'Publish the scheduled posts',
          description:
            'Promotes every draft whose publish date has passed, and optionally the drafts that carry no date at all.',
          body: Type.Object({
            publishAllDrafts: Type.Optional(Type.Boolean({ default: false }))
          }),
          response: {
            200: Type.Ref('PostPublishResponse')
          }
        }
      },
      async (req, reply) => {
        const published = await publishScheduledPosts(
          req.body.publishAllDrafts
        );
        return reply.send({ published, latest: await latestPublishedPost() });
      }
    );
  },
  {
    roles: ['Admin'],
    rateLimit: { max: 5 }
  }
);

registerModel(
  Type.Object(
    {
      published: Type.Integer(),
      latest: Nullable(Type.Ref('PostSingle'))
    },
    { $id: 'PostPublishResponse' }
  )
);
