import { Type } from '@sinclair/typebox';
import { registerModel, registerRoute } from '@appweaver/core';
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
          headers: Type.Object({ 'x-my-custom-header': Type.String() }),
          body: Type.Object({ now: Type.Boolean() }),
          response: {
            200: Type.Ref('PostPublishResponse')
          }
        }
      },
      async (req, reply) => {
        const count = await publishPosts();
        return reply.send({
          text: `Posts published: ${count}, now: ${req.body.now}`,
          post: null
        });
      }
    );
  },
  {
    public: false,
    recaptcha: true,
    roles: ['Admin'],
    rateLimit: { max: 5 }
  }
);

registerModel(
  'PostPublishResponse',
  Type.Object({
    text: Type.String(),
    post: Nullable(Type.Ref('PostSingle'))
  })
);
