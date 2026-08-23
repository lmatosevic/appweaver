import { injectService } from '@appweaver/core';
import db from '@db/client';
import { Post, PostResourceService } from '@/types';

/** Promotes the drafts whose publish date has passed. Drafts without a date
 * are published as of now only when `publishAllDrafts` is set. */
export async function publishScheduledPosts(
  publishAllDrafts: boolean = false
): Promise<number> {
  const now = new Date();

  const scheduled = await db.post.updateMany({
    where: { status: 'Draft', publishedAt: { not: null, lte: now } },
    data: { status: 'Published' }
  });

  if (!publishAllDrafts) {
    return scheduled.count;
  }

  const remaining = await db.post.updateMany({
    where: { status: 'Draft' },
    data: { status: 'Published', publishedAt: now }
  });

  return scheduled.count + remaining.count;
}

/** The most recently published post, or null while there is none. */
export async function latestPublishedPost(): Promise<Post | null> {
  const latest = await db.post.findFirst({
    where: { status: 'Published' },
    orderBy: { publishedAt: 'desc' },
    select: { id: true }
  });

  if (!latest) {
    return null;
  }

  return injectService<PostResourceService>('Post').find(latest.id);
}
