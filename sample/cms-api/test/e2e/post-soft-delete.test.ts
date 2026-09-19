import { Application, createApp, injectService } from '@appweaver/core';
import { resetTestData } from './support/reset';

/**
 * Posts and their comments soft delete their records, so a deleted post stays
 * in the database for a manual restore, while every read behaves as if it was
 * removed. Runs against the real database, so the filters hiding the deleted
 * records are proven to be valid database queries.
 */
describe('Soft deleting a post', () => {
  let app: Application;
  let posts: any;
  let comments: any;

  const seedPost = async (slug: string) =>
    posts.create({ title: `Post ${slug}`, slug });

  const seedComment = async (postId: number, body: string) =>
    comments.create({ body, post: postId });

  const stored = async (service: any, id: number | string) =>
    service.client.findFirst({ where: { id } });

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    posts = injectService('Post');
    comments = injectService('Comment');
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  beforeEach(async () => {
    await posts.client.updateMany({ data: { pinnedCommentId: null } });
    await comments.client.deleteMany({});
    await posts.client.deleteMany({});
  });

  test('keeps the deleted post in the database', async () => {
    const post = await seedPost('kept');

    await posts.delete(post.id);

    const record = await stored(posts, post.id);
    expect(record.deletedAt).toBeInstanceOf(Date);
    expect(record.deletedById).toBeNull();
  });

  test('hides the deleted post from every action', async () => {
    const post = await seedPost('hidden');

    await posts.delete(post.id);

    await expect(posts.find(post.id)).rejects.toMatchObject({
      statusCode: 404
    });
    await expect(
      posts.update(post.id, { title: 'Back' })
    ).rejects.toMatchObject({ statusCode: 404 });
    await expect(posts.delete(post.id)).rejects.toMatchObject({
      statusCode: 404
    });

    const result = await posts.query({ slug: 'hidden' });
    expect(result.items).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  test('responds to a deleted post as to a missing one', async () => {
    const post = await seedPost('missing');

    await posts.delete(post.id);

    const response = await app.server.inject({
      method: 'GET',
      url: `/api/posts/${post.id}`
    });
    expect(response.statusCode).toBe(404);
  });

  test('soft deletes the comments of the deleted post with it', async () => {
    const post = await seedPost('cascade');
    const comment = await seedComment(post.id, 'Cascaded comment');

    await posts.delete(post.id);

    const postRecord = await stored(posts, post.id);
    const commentRecord = await stored(comments, comment.id);
    expect(commentRecord.deletedAt).toEqual(postRecord.deletedAt);

    await expect(comments.find(comment.id)).rejects.toMatchObject({
      statusCode: 404
    });
  });

  test('leaves out the deleted comments of a live post', async () => {
    const post = await seedPost('live');
    await seedComment(post.id, 'Kept comment');
    const deleted = await seedComment(post.id, 'Deleted comment');

    await comments.delete(deleted.id);

    const found = await posts.find(post.id);
    expect(found.comments.map((comment: any) => comment.body)).toEqual([
      'Kept comment'
    ]);
    expect(found.commentsCount).toBe(1);
  });

  test('matches no relation filter through a deleted comment', async () => {
    const post = await seedPost('filtered');
    const deleted = await seedComment(post.id, 'Deleted comment');

    await comments.delete(deleted.id);

    const matched = await posts.query({
      comments: { _some: { body: 'Deleted comment' } }
    });
    expect(matched.items).toEqual([]);

    const empty = await posts.query({ comments: { _exists: false } });
    expect(empty.items.map((item: any) => item.slug)).toEqual(['filtered']);
  });

  test('reads a deleted pinned comment as missing', async () => {
    const post = await seedPost('pinned');
    const comment = await seedComment(post.id, 'Pinned comment');
    await posts.update(post.id, { pinnedComment: comment.id });

    await comments.delete(comment.id);

    const found = await posts.find(post.id);
    expect(found.pinnedComment).toBeNull();

    const unpinned = await posts.query({ pinnedComment: null });
    expect(unpinned.items.map((item: any) => item.slug)).toEqual(['pinned']);

    const pinned = await posts.query({ pinnedComment: { _exists: true } });
    expect(pinned.items).toEqual([]);

    // The reference is kept, so a restore brings the pin back as well
    const record = await stored(posts, post.id);
    expect(record.pinnedCommentId).toBe(comment.id);
  });

  test('serializes a post whose pinned comment is deleted', async () => {
    const post = await seedPost('serialized');
    const comment = await seedComment(post.id, 'Pinned comment');
    await posts.update(post.id, { pinnedComment: comment.id });

    await comments.delete(comment.id);

    const response = await app.server.inject({
      method: 'GET',
      url: `/api/posts/${post.id}`
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ pinnedComment: null });
    expect(response.json()).not.toHaveProperty('deletedAt');
  });

  test('rejects pinning a deleted comment', async () => {
    const post = await seedPost('rejected');
    const comment = await seedComment(post.id, 'Deleted comment');

    await comments.delete(comment.id);

    await expect(
      posts.update(post.id, { pinnedComment: comment.id })
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});
