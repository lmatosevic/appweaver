import { Type } from '@sinclair/typebox';
import { createMcpTool } from '@appweaver/mcp';
import {
  latestPublishedPost,
  publishScheduledPosts
} from '@/features/publisher/publish';

// The publish route as a tool of the AI agents, changing existing posts, so
// exposed only with `mcp.destructiveEnabled`
createMcpTool({
  name: 'publishScheduledPosts',
  title: 'Publish the scheduled posts',
  description:
    'Publishes every draft whose publish date has passed, and with publishAllDrafts every other draft as of now. Returns how many were published and the latest published post.',
  input: Type.Object({
    publishAllDrafts: Type.Optional(Type.Boolean({ default: false }))
  }),
  output: Type.Object({
    published: Type.Integer(),
    latest: Type.Union([
      Type.Object({
        id: Type.Integer(),
        title: Type.String(),
        slug: Type.String()
      }),
      Type.Null()
    ])
  }),
  roles: ['Admin'],
  destructive: true,
  handler: async ({ publishAllDrafts }) => {
    const published = await publishScheduledPosts(publishAllDrafts);
    const latest = await latestPublishedPost();
    return {
      published,
      latest: latest && {
        id: latest.id,
        title: latest.title,
        slug: latest.slug
      }
    };
  }
});
