import db from '@db/client';

const include = {
  author: {
    select: { id: true, email: true, firstName: true, lastName: true }
  },
  category: { select: { id: true, name: true } },
  tags: { select: { name: true }, orderBy: { name: 'asc' } }
} as const;

/** The published post of a slug with its author, category, tags and comment count, or null if there is none. */
export async function findPublishedPost(slug: string) {
  return db.post.findFirst({
    where: { slug, status: 'Published', deletedAt: null },
    include: {
      ...include,
      _count: { select: { comments: { where: { status: 'Approved' } } } }
    }
  });
}

/** Every published post, the most recent first. */
export async function findPublishedPosts() {
  return db.post.findMany({
    where: { status: 'Published', deletedAt: null },
    include,
    orderBy: { publishedAt: 'desc' }
  });
}
