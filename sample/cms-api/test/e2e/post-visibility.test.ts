import { Application, createApp, injectService } from '@appweaver/core';
import { resetTestData } from './support/reset';

/**
 * The public routes of the posts serve the published ones only, and the
 * fields the author relation leaves out of its output cannot be filtered on,
 * so an anonymous reader cannot guess them one condition at a time.
 */
describe('Post visibility', () => {
  let app: Application;
  let posts: any;

  const query = (body: object) =>
    app.server.inject({
      method: 'POST',
      url: '/api/posts/query',
      payload: body
    });

  beforeAll(async () => {
    app = await createApp();
    posts = injectService('Post');
  });

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  beforeEach(async () => {
    await posts.client.deleteMany({});
  });

  test('serves the published posts only to an anonymous reader', async () => {
    await posts.create({
      title: 'Out now',
      slug: 'out-now',
      status: 'Published'
    });
    const draft = await posts.create({ title: 'Not yet', slug: 'not-yet' });

    const listed = await query({ size: 10 });
    const found = await app.server.inject({
      method: 'GET',
      url: `/api/posts/${draft.id}`
    });

    expect(listed.statusCode).toBe(200);
    expect(listed.json().items.map((post: any) => post.slug)).toEqual([
      'out-now'
    ]);
    expect(found.statusCode).toBe(404);
  });

  test('rejects a filter on a field the author relation omits', async () => {
    const response = await query({
      filter: { author: { email: { _like: 'admin@%' } } }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('VALIDATION_FAILED');
  });

  test('rejects a filter beyond the complexity limits', async () => {
    const response = await query({
      filter: {
        _or: Array.from({ length: 1500 }, (_, index) => ({
          slug: `s-${index}`
        }))
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('RESOURCE_FILTER_TOO_COMPLEX');
  });
});
