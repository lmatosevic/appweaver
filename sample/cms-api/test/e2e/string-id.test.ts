import {
  Application,
  createApp,
  FileService,
  inject,
  injectService
} from '@appweaver/core';
import { CommentQuery } from '@/types/generated';
import { resetTestData } from './support/reset';

/**
 * Exercises the Comment model, whose primary key is a generated string, against
 * the real database: the column type, the route path parameter, the relation
 * inputs on both sides of a string/integer id pair, and the file owner column.
 */
describe('String primary key resources', () => {
  let app: Application;
  let comments: any;
  let posts: any;
  let users: any;
  // Only the read routes of the Comment resource are public, so the write ones
  // are called with a bearer token of a signed-in user
  let auth: Record<string, string>;

  const seedPost = async (slug: string) =>
    posts.create({ title: `Post ${slug}`, slug });

  const seedComment = async (postId: number, body: string = 'A comment') =>
    comments.create({ body, post: postId });

  const signIn = async (): Promise<Record<string, string>> => {
    const email = 'string-id@example.com';
    const password = 'Str1ngId!Pass';

    await users.client.deleteMany({ where: { email } });
    await users.create({
      firstName: 'String',
      lastName: 'Id',
      email,
      phone: '+38512345678',
      password
    });

    const response = await app.server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: email, password }
    });

    return { authorization: `Bearer ${response.json().accessToken}` };
  };

  beforeAll(async () => {
    app = await createApp({ autoStartServer: false });
    comments = injectService('Comment');
    posts = injectService('Post');
    users = injectService('User');
    auth = await signIn();
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  beforeEach(async () => {
    await comments.client.deleteMany({});
    await posts.client.deleteMany({});
  });

  describe('generated identifiers', () => {
    test('generates a string id on create', async () => {
      const post = await seedPost('generated-id');
      const comment = await seedComment(post.id);

      expect(typeof comment.id).toBe('string');
      expect(comment.id.length).toBeGreaterThan(0);
      expect(comment.id).not.toMatch(/^\d+$/);
    });

    test('generates a distinct id per record', async () => {
      const post = await seedPost('distinct-ids');
      const [first, second] = await Promise.all([
        seedComment(post.id, 'First'),
        seedComment(post.id, 'Second')
      ]);

      expect(first.id).not.toBe(second.id);
    });
  });

  describe('service operations', () => {
    test('finds, updates, and deletes a record by its string id', async () => {
      const post = await seedPost('service-ops');
      const created = await seedComment(post.id, 'Original body');

      const found = await comments.find(created.id);
      expect(found.id).toBe(created.id);
      expect(found.body).toBe('Original body');

      const updated = await comments.update(created.id, {
        body: 'Updated body'
      });
      expect(updated.id).toBe(created.id);
      expect(updated.body).toBe('Updated body');

      const deleted = await comments.delete(created.id);
      expect(deleted.id).toBe(created.id);
      await expect(comments.find(created.id)).rejects.toThrow();
    });

    test('filters by the string id', async () => {
      const post = await seedPost('filter-by-id');
      const first = await seedComment(post.id, 'First');
      await seedComment(post.id, 'Second');

      const filter: CommentQuery = { id: first.id };
      const result = await comments.query(filter);

      expect(result.totalCount).toBe(1);
      expect(result.items[0].id).toBe(first.id);
    });
  });

  describe('routes', () => {
    test('accepts a string id as the path parameter', async () => {
      const post = await seedPost('route-find');
      const created = await seedComment(post.id, 'Routed comment');

      const response = await app.server.inject({
        method: 'GET',
        url: `/api/comments/${created.id}`
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        id: created.id,
        body: 'Routed comment'
      });
    });

    test('answers with a not found status for an unknown string id', async () => {
      const response = await app.server.inject({
        method: 'GET',
        url: '/api/comments/missing-id'
      });

      expect(response.statusCode).toBe(404);
    });

    test('creates a record through the route with a numeric relation id', async () => {
      const post = await seedPost('route-create');

      const response = await app.server.inject({
        method: 'POST',
        url: '/api/comments',
        headers: auth,
        payload: { body: 'Created over HTTP', post: post.id }
      });

      expect(response.statusCode).toBe(201);
      expect(typeof response.json().id).toBe('string');
    });

    test('updates and deletes through the route by the string id', async () => {
      const post = await seedPost('route-update');
      const created = await seedComment(post.id, 'Before');

      const updateResponse = await app.server.inject({
        method: 'PUT',
        url: `/api/comments/${created.id}`,
        headers: auth,
        payload: { body: 'After' }
      });
      expect(updateResponse.statusCode).toBe(200);
      expect(updateResponse.json().body).toBe('After');

      const deleteResponse = await app.server.inject({
        method: 'DELETE',
        url: `/api/comments/${created.id}`,
        headers: auth
      });
      expect(deleteResponse.statusCode).toBe(200);
      expect(deleteResponse.json().id).toBe(created.id);
    });
  });

  describe('relations across id types', () => {
    test('connects a string id record from a model with an integer id', async () => {
      const post = await seedPost('pin-comment');
      const comment = await seedComment(post.id, 'Pinned');

      const updated = await posts.update(post.id, {
        pinnedComment: comment.id
      });

      expect(updated.pinnedComment.id).toBe(comment.id);
    });

    // A nullable to-one relation serializes as `anyOf: [<model>, null]`, the one
    // shape the response serializer validates before picking a branch, so the
    // related model has to satisfy its own output schema
    test('serializes a populated nullable relation over the route', async () => {
      const post = await seedPost('pin-serialize');
      const comment = await seedComment(post.id, 'Pinned');
      await posts.update(post.id, { pinnedComment: comment.id });

      const response = await app.server.inject({
        method: 'GET',
        url: `/api/comments/${comment.id}`
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().pinnedIn).toMatchObject({ id: post.id });
    });

    test('connects an integer id record from a model with a string id', async () => {
      const first = await seedPost('first-post');
      const second = await seedPost('second-post');
      const comment = await seedComment(first.id, 'Moving comment');

      const updated = await comments.update(comment.id, { post: second.id });

      expect(updated.post.id).toBe(second.id);
    });

    test('counts the related string id records', async () => {
      const post = await seedPost('count-comments');
      await seedComment(post.id, 'One');
      await seedComment(post.id, 'Two');

      const found = await posts.find(post.id);

      expect(found.commentsCount).toBe(2);
    });
  });

  describe('file ownership', () => {
    /** Builds a multipart body holding a single text file field. */
    const multipart = (
      field: string,
      fileName: string,
      content: string
    ): { payload: Buffer; headers: Record<string, string> } => {
      const boundary = '----AppweaverStringIdBoundary';
      const payload = Buffer.from(
        `--${boundary}\r\n` +
          `Content-Disposition: form-data; name="${field}"; filename="${fileName}"\r\n` +
          `Content-Type: text/plain\r\n\r\n` +
          `${content}\r\n` +
          `--${boundary}--\r\n`
      );

      return {
        payload,
        headers: {
          ...auth,
          'content-type': `multipart/form-data; boundary=${boundary}`
        }
      };
    };

    test('stores the owning string id on the uploaded file', async () => {
      const post = await seedPost('file-owner');
      const comment = await seedComment(post.id, 'With attachment');

      const response = await app.server.inject({
        method: 'POST',
        url: `/api/comments/${comment.id}/files`,
        ...multipart('attachment', 'notes.txt', 'attachment content')
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().attachment.originalName).toBe('notes.txt');

      // The owner column holds the string id as text
      const stored = await comments.client.findFirst({
        where: { id: comment.id },
        include: { attachment: true }
      });
      expect(stored.attachment.resourceId).toBe(comment.id);
      expect(stored.attachment.resourceName).toBe('Comment');
    });

    test('deletes the files of a removed string id resource', async () => {
      const post = await seedPost('file-cleanup');
      const comment = await seedComment(post.id, 'Attachment removed');

      await app.server.inject({
        method: 'POST',
        url: `/api/comments/${comment.id}/files`,
        ...multipart('attachment', 'cleanup.txt', 'to be removed')
      });

      const deleted = await inject(FileService).deleteResourceFiles(
        'Comment',
        comment.id
      );

      expect(deleted).toHaveLength(1);
      expect(deleted[0].resourceId).toBe(comment.id);
    });
  });
});
