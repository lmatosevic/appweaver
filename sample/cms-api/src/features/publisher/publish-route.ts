import { Type } from '@sinclair/typebox';
import { registerRoute } from '@appweaver/core';
import { Nullable } from '@appweaver/common';
import { publishPosts } from '@/features/publisher/publish';

registerRoute(
  (router) => {
    router.post(
      '/publish-posts',
      {
        schema: {
          tags: ['Posts'],
          summary: 'Publish all posts',
          description: 'Publish all posts',
          body: Type.Object({ now: Type.Boolean() }),
          response: {
            200: Type.Object({
              text: Type.String(),
              post: Nullable(Type.Ref('PostSingle'))
            })
          }
        }
      },
      async (req, reply) => {
        const count = await publishPosts();
        reply.send({
          text: `Posts published: ${count}, now: ${req.body.now}`,
          post: null
        });
      }
    );
  },
  {
    public: false,
    roles: ['Admin'],
    rateLimit: { max: 5 }
  }
);
