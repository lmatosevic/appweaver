import { Database } from '@appweaver/common';
import { Application, createApp, inject, injectService } from '@appweaver/core';
import { hashPassword } from '@appweaver/data';
import { resetTestData } from './support/reset';

/**
 * The edge cases of V3-QA-01 (PLAN-v3.md) the other suites leave out, against the real database: concurrent writes,
 * ties in a sort, null against empty, dates with an offset, case-insensitive matching, and tokens outliving a change
 * of their user. A test asserting a behavior the plan changes in v3 says so.
 */
describe('Edge cases', () => {
  let app: Application;
  let posts: any;
  let tags: any;
  let users: any;

  const request = async (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: any,
    headers: Record<string, string> = {}
  ) => {
    const response = await app.server.inject({
      method,
      url,
      payload,
      headers
    });
    const json = response.headers['content-type']?.includes('json');
    return {
      status: response.statusCode,
      body: json ? response.json() : response.body
    };
  };

  /** Creates a user with the given roles and signs them in. */
  const signIn = async (
    email: string,
    roles: string[] = ['Admin']
  ): Promise<{ id: number; tokens: any; auth: Record<string, string> }> => {
    const password = 'EdgeCases!Pass1';
    await users.client.deleteMany({ where: { email } });
    const user = await users.client.create({
      data: {
        firstName: 'Edge',
        lastName: 'Cases',
        email,
        passwordHash: await hashPassword(password),
        roles: {
          connectOrCreate: roles.map((name) => ({
            where: { name },
            create: { name }
          }))
        }
      }
    });
    const { body: tokens } = await request('POST', '/auth/login', {
      username: email,
      password
    });
    return {
      id: user.id,
      tokens,
      auth: { authorization: `Bearer ${tokens.accessToken}` }
    };
  };

  const createPost = (data: Record<string, unknown>) =>
    posts.create({ title: 'Edge case', status: 'Published', ...data });

  beforeAll(async () => {
    app = await createApp();
    posts = injectService('Post');
    tags = injectService('Tag');
    users = injectService('User');
  }, 30_000);

  afterAll(async () => {
    await app.stop();
  });

  afterAll(resetTestData, 10_000);

  beforeEach(async () => {
    await posts.client.deleteMany({});
    await tags.client.deleteMany({});
  });

  describe('concurrent writes', () => {
    test('rejects all but one of the concurrent creates of a unique value with a 409', async () => {
      const { auth } = await signIn('edge-unique@example.com');

      const responses = await Promise.all(
        Array.from({ length: 8 }, () =>
          request('POST', '/api/tags', { name: 'Race', slug: 'race' }, auth)
        )
      );

      const statuses = responses.map((response) => response.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409, 409, 409, 409, 409]);
      for (const response of responses.filter((r) => r.status === 409)) {
        expect(response.body.code).toBe('DATABASE_UNIQUE_VIOLATION');
      }
      expect(await tags.client.count()).toBe(1);
    });

    // A lost update: v3 adds no optimistic locking (If-Match) yet, the last write wins
    test('applies two concurrent updates of one field, the last write winning', async () => {
      const { auth } = await signIn('edge-update@example.com');
      const post = await createPost({ slug: 'concurrent' });

      const responses = await Promise.all(
        ['First title', 'Second title'].map((title) =>
          request('PATCH', `/api/posts/${post.id}`, { title }, auth)
        )
      );

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      const stored = await posts.client.findUnique({ where: { id: post.id } });
      expect(['First title', 'Second title']).toContain(stored.title);
    });

    test('keeps both concurrent updates of different fields', async () => {
      const { auth } = await signIn('edge-fields@example.com');
      const post = await createPost({ slug: 'fields', featured: false });

      await Promise.all([
        request('PATCH', `/api/posts/${post.id}`, { title: 'Renamed' }, auth),
        request('PATCH', `/api/posts/${post.id}`, { featured: true }, auth)
      ]);

      const stored = await posts.client.findUnique({ where: { id: post.id } });
      expect(stored).toMatchObject({ title: 'Renamed', featured: true });
    });
  });

  describe('query', () => {
    test('pages through the ties of a sort without a duplicate or a gap', async () => {
      for (let i = 0; i < 25; i++) {
        await createPost({ slug: `tie-${i}`, featured: true });
      }

      const seen: number[] = [];
      for (let page = 1; page <= 3; page++) {
        const result = await posts.query({
          sort: 'featured',
          page,
          size: 10,
          totalCount: false
        });
        seen.push(...result.items.map((item: any) => item.id));
      }

      expect(seen).toHaveLength(25);
      expect(new Set(seen).size).toBe(25);
    });

    test('tells a null value from an empty string', async () => {
      await createPost({ slug: 'null-excerpt', excerpt: null });
      await createPost({ slug: 'empty-excerpt', excerpt: '' });
      await createPost({ slug: 'some-excerpt', excerpt: 'Some' });

      const slugs = async (filter: object) =>
        (await posts.query({ filter, sort: 'slug', totalCount: false })).items
          .map((item: any) => item.slug)
          .sort();

      expect(await slugs({ excerpt: null })).toEqual(['null-excerpt']);
      expect(await slugs({ excerpt: '' })).toEqual(['empty-excerpt']);
      expect(await slugs({ excerpt: { _exists: true } })).toEqual([
        'empty-excerpt',
        'some-excerpt'
      ]);
    });

    test('compares the dates of another time zone by their instant', async () => {
      await createPost({
        slug: 'offset',
        publishedAt: '2026-03-01T10:00:00+02:00'
      });

      const stored = await posts.client.findFirst({
        where: { slug: 'offset' }
      });
      expect(stored.publishedAt.toISOString()).toBe('2026-03-01T08:00:00.000Z');

      const matched = async (filter: object) =>
        (await posts.query({ filter, totalCount: false })).items.length;
      expect(
        await matched({ publishedAt: { _gte: '2026-03-01T09:00:00+01:00' } })
      ).toBe(1);
      expect(
        await matched({ publishedAt: { _gt: '2026-03-01T09:00:00+01:00' } })
      ).toBe(0);
    });

    // SQLite compares ASCII without case in LIKE, and has no insensitive mode for the others
    test('matches without case with _like and _ilike on SQLite', async () => {
      await createPost({ slug: 'case', title: 'Trails of the North' });

      const titles = async (filter: object) =>
        (await posts.query({ filter, totalCount: false })).items.map(
          (item: any) => item.title
        );

      expect(await titles({ title: { _like: '%TRAILS%' } })).toEqual([
        'Trails of the North'
      ]);
      expect(await titles({ title: { _ilike: '%trails%' } })).toEqual([
        'Trails of the North'
      ]);
    });
  });

  describe('tokens outliving a change of their user', () => {
    test('denies the admin routes as soon as the role is removed', async () => {
      const { id, auth } = await signIn('edge-role@example.com', [
        'Admin',
        'User'
      ]);
      expect(
        (await request('POST', '/api/posts/export', {}, auth)).status
      ).toBe(200);

      const role = await inject<any>(Database)
        .client()
        .role.findFirst({
          where: { name: 'User' }
        });
      await users.update(id, { roles: [role.id] });

      expect(
        (await request('POST', '/api/posts/export', {}, auth)).status
      ).toBe(403);
    });

    test('rejects the token of a disabled user', async () => {
      const { id, auth } = await signIn('edge-disabled@example.com');

      await users.update(id, { enabled: false });

      expect((await request('GET', '/auth/me', undefined, auth)).status).toBe(
        401
      );
    });

    // No rotation yet: v3 makes the refresh tokens rotate with reuse detection (D5, V3-CONV-04)
    test('accepts a refresh token twice', async () => {
      const { tokens } = await signIn('edge-refresh@example.com');
      const refresh = () =>
        request('POST', '/auth/refresh', undefined, {
          authorization: `Bearer ${tokens.refreshToken}`
        });

      expect((await refresh()).status).toBe(200);
      expect((await refresh()).status).toBe(200);
    });
  });
});
