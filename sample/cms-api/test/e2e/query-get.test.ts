import {
  Application,
  createApp,
  hashPassword,
  injectService
} from '@appweaver/core';
import { resetTestData } from './support/reset';

/**
 * Exercises the GET variants of the query and aggregate routes against the real
 * database. The User query and Post aggregate routes serve both methods, the Tag
 * query only the GET one, and the Post query only the POST one.
 */
describe('Query and aggregate GET routes', () => {
  let app: Application;
  let posts: any;
  let tags: any;
  let users: any;
  // The User query and Post aggregate routes require a signed-in administrator
  let auth: Record<string, string>;

  // Seeded once, since the cached User query is not invalidated by direct
  // database writes
  const domain = '@query-get.test';
  const seedUsers = async () => {
    await users.client.deleteMany({ where: { email: { endsWith: domain } } });
    await users.client.createMany({
      data: ['Ana', 'Bruno', 'Cvita'].map((firstName) => ({
        firstName,
        lastName: 'Query',
        email: `${firstName.toLowerCase()}${domain}`
      }))
    });
  };

  const from = '2026-01-01T00:00:00.000Z';
  const to = '2026-01-03T00:00:00.000Z';

  /** Encodes the criteria as query parameters, the objects among them as JSON. */
  const params = (criteria: Record<string, unknown>): string =>
    new URLSearchParams(
      Object.entries(criteria).map(([key, value]) => [
        key,
        typeof value === 'string' ? value : JSON.stringify(value)
      ])
    ).toString();

  const request = async (
    method: 'GET' | 'POST',
    url: string,
    payload?: any,
    headers: Record<string, string> = {}
  ) => {
    const response = await app.server.inject({ method, url, payload, headers });
    return { status: response.statusCode, body: response.json() };
  };

  const signInAdmin = async (): Promise<Record<string, string>> => {
    const email = 'query-get@example.com';
    const password = 'QueryGet!Pass1';

    await users.client.deleteMany({ where: { email } });
    await users.client.create({
      data: {
        firstName: 'Query',
        lastName: 'Get',
        email,
        phone: '+38512345679',
        passwordHash: await hashPassword(password),
        roles: {
          connectOrCreate: {
            where: { name: 'Admin' },
            create: { name: 'Admin' }
          }
        }
      }
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
    posts = injectService('Post');
    tags = injectService('Tag');
    users = injectService('User');
    auth = await signInAdmin();
    await seedUsers();
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  beforeEach(async () => {
    await posts.client.deleteMany({});
    await tags.client.deleteMany({});

    await posts.client.createMany({
      data: [
        {
          title: 'First post',
          slug: 'first-post',
          viewCount: 3,
          createdAt: new Date('2026-01-01T10:00:00.000Z')
        },
        {
          title: 'Second post',
          slug: 'second-post',
          viewCount: 7,
          createdAt: new Date('2026-01-02T10:00:00.000Z')
        },
        {
          title: 'Third post',
          slug: 'third-post',
          viewCount: 12,
          createdAt: new Date('2026-01-02T12:00:00.000Z')
        }
      ]
    });

    await tags.client.createMany({
      data: [
        { name: 'news', slug: 'news' },
        { name: 'guides', slug: 'guides' },
        { name: 'events', slug: 'events' }
      ]
    });
  });

  describe('GET /api/users/query', () => {
    const filter = { email: { _contains: domain } };

    const get = async (criteria: Record<string, unknown>) =>
      request('GET', `/api/users/query?${params(criteria)}`, undefined, auth);

    test('filters, sorts, and pages by the query parameters', async () => {
      const { status, body } = await get({
        filter,
        sort: '-firstName',
        size: 1,
        page: 2
      });

      expect(status).toBe(200);
      expect(body.totalCount).toBe(3);
      expect(body.items.map((user: any) => user.firstName)).toEqual(['Bruno']);
    });

    test('returns the same page as the POST route', async () => {
      const criteria = {
        filter,
        sort: { firstName: 'asc' },
        size: 2,
        totalCount: false
      };

      const viaPost = await request('POST', '/api/users/query', criteria, auth);
      const viaGet = await get(criteria);

      expect(viaGet.status).toBe(200);
      expect(viaGet.body).toEqual(viaPost.body);
      expect(viaGet.body.totalCount).toBeNull();
    });

    test('follows the cursor a GET response issued', async () => {
      const first = await get({ filter, sort: 'firstName', size: 2 });
      const second = await get({
        filter,
        sort: 'firstName',
        size: 2,
        cursor: first.body.nextCursor
      });

      expect(first.body.items.map((user: any) => user.firstName)).toEqual([
        'Ana',
        'Bruno'
      ]);
      expect(second.body.items.map((user: any) => user.firstName)).toEqual([
        'Cvita'
      ]);
    });

    test('rejects a filter that is not valid JSON', async () => {
      const { status, body } = await request(
        'GET',
        '/api/users/query?filter={email',
        undefined,
        auth
      );

      expect(status).toBe(400);
      expect(body.code).toBe('RESOURCE_INVALID_QUERY_PARAMETER');
      expect(body.detail).toContain("'filter'");
    });

    test('keeps the access rules of the route', async () => {
      const { status } = await request(
        'GET',
        `/api/users/query?${params({ filter })}`
      );

      expect(status).toBe(401);
    });
  });

  describe('POST-only /api/posts/query', () => {
    test('registers no GET route', async () => {
      // The request falls through to GET /:id, which rejects "query" as an id
      const { status, body } = await request('GET', '/api/posts/query');

      expect(status).toBe(400);
      expect(body.code).toBe('VALIDATION_FAILED');
      expect(body.errors[0].pointer).toBe('#/params/id');
    });
  });

  describe('GET /api/posts/aggregate', () => {
    const criteria = {
      select: { viewCount: { sum: true, max: true } },
      filter: { viewCount: { _gte: 5 } },
      dateField: 'createdAt',
      from,
      to
    };

    test('aggregates by the query parameters', async () => {
      const { status, body } = await request(
        'GET',
        `/api/posts/aggregate?${params(criteria)}`,
        undefined,
        auth
      );

      expect(status).toBe(200);
      expect(body.total.viewCount).toEqual({ sum: 19, max: 12 });
    });

    test('returns the same result as the POST route', async () => {
      const viaPost = await request(
        'POST',
        '/api/posts/aggregate',
        criteria,
        auth
      );
      const viaGet = await request(
        'GET',
        `/api/posts/aggregate?${params(criteria)}`,
        undefined,
        auth
      );

      expect(viaGet.body).toEqual(viaPost.body);
    });

    test('keeps the access rules of the route', async () => {
      const { status } = await request(
        'GET',
        `/api/posts/aggregate?${params(criteria)}`
      );

      expect(status).toBe(401);
    });
  });

  describe('GET-only /api/tags/query', () => {
    test('serves the GET route', async () => {
      const { status, body } = await request(
        'GET',
        `/api/tags/query?${params({ filter: { name: 'news' } })}`
      );

      expect(status).toBe(200);
      expect(body.items.map((tag: any) => tag.name)).toEqual(['news']);
    });

    test('registers no POST route', async () => {
      const { status } = await request('POST', '/api/tags/query', {});

      expect(status).toBe(404);
    });
  });
});
