import { Type } from '@sinclair/typebox';
import {
  ErrorCode,
  TemplateEngine,
  templateContentType,
  appConfig,
  ResourceError
} from '@appweaver/common';
import { currentAuthUser, EmailService, inject } from '@appweaver/core';
import { errorResponses, registerRoute, serverConfig } from '@appweaver/web';
import { findPublishedPost, findPublishedPosts } from './posts';

// The locale chosen by the application, here a request parameter, passed to
// the template engine and the email service
const locale = Type.Optional(
  Type.String({ description: 'Locale to render in, i.e. `de`.' })
);

registerRoute(
  (router) => {
    router.get(
      '/posts/:slug/page',
      {
        schema: {
          tags: ['Posts'],
          summary: 'Render a published post as an HTML page',
          params: Type.Object({ slug: Type.String() }),
          querystring: Type.Object({ locale }),
          produces: ['text/html'],
          response: {
            200: Type.String({ description: 'The HTML page.' }),
            ...errorResponses(ErrorCode.ResourceNotFound)
          }
        }
      },
      async (req, reply) => {
        const post = await findPublishedPost(req.params.slug);
        if (!post) {
          throw new ResourceError(
            ErrorCode.ResourceNotFound,
            `Post '${req.params.slug}' not found`,
            { model: 'Post' }
          );
        }

        const name = 'pages/post.html';
        const html = await inject(TemplateEngine).render(
          name,
          {
            post,
            author: post.author
              ? `${post.author.firstName} ${post.author.lastName}`
              : null,
            commentCount: post._count.comments
          },
          { locale: req.query.locale }
        );

        return reply.type(templateContentType(name)).send(html);
      }
    );
  },
  { public: true }
);

registerRoute(
  (router) => {
    // An XML document for an external integration, i.e. an ERP import
    router.get(
      '/posts/export/xml',
      {
        schema: {
          tags: ['Posts'],
          summary: 'Export the published posts as an XML document',
          produces: ['application/xml'],
          response: {
            200: Type.String({ description: 'The XML document.' })
          }
        }
      },
      async (_req, reply) => {
        const name = 'exports/posts.xml';
        const xml = await inject(TemplateEngine).render(name, {
          posts: await findPublishedPosts(),
          generatedAt: new Date()
        });

        return reply
          .type(templateContentType(name))
          .header('Content-Disposition', 'attachment; filename="posts.xml"')
          .send(xml);
      }
    );
  },
  { roles: ['Admin'] }
);

registerRoute(
  (router) => {
    router.post(
      '/posts/:slug/share',
      {
        schema: {
          tags: ['Posts'],
          summary: 'Email a published post to a reader',
          params: Type.Object({ slug: Type.String() }),
          body: Type.Object({
            email: Type.String({ format: 'email' }),
            locale
          }),
          response: {
            200: Type.Object({ message: Type.String() }),
            ...errorResponses(ErrorCode.ResourceNotFound)
          }
        }
      },
      async (req) => {
        const post = await findPublishedPost(req.params.slug);
        if (!post) {
          throw new ResourceError(
            ErrorCode.ResourceNotFound,
            `Post '${req.params.slug}' not found`,
            { model: 'Post' }
          );
        }

        const query = req.body.locale
          ? `?locale=${encodeURIComponent(req.body.locale)}`
          : '';
        await inject(EmailService).sendEmail({
          to: req.body.email,
          template: 'emails/post-share',
          data: {
            post,
            sender: currentAuthUser()!.email,
            link: `${appConfig.HOSTNAME}${serverConfig.API_PREFIX}/posts/${post.slug}/page${query}`
          },
          locale: req.body.locale
        });

        return { message: 'Post shared' };
      }
    );
  },
  { roles: ['Admin', 'User'], rateLimit: { max: 10 } }
);
