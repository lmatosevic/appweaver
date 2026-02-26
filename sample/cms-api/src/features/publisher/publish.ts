import db from '@db/client';

export async function publishPosts(): Promise<number> {
  const posts = await db.post.findMany({ where: { lastActivity: null } });
  return posts.length;
}
